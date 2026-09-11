-- =============================================================================
-- contacts_branch_isolation
--
-- Aísla la tabla contacts por branch para cerrar la fuga cross-tenant.
-- Principio rector: fail-closed. Un branch_id nulo o ajeno hace que la fila
-- sea invisible/inescribible (nunca se cae a un default permisivo).
--
-- Esta migration es auto-contenida: dropear _find_or_create_contact(text,text)
-- deja los 3 callers rotos hasta que se recrean, así que todo va en un solo
-- bloque atómico.
-- =============================================================================

-- 1. Agregar branch_id (nullable en DDL; enforcement va por RLS y firma de función)
alter table public.contacts
  add column if not exists branch_id uuid references public.branches(id);
-- Sin ON DELETE: igual que movements_branch_id_fkey y services_branch_id_fkey
-- (borrar una branch con contactos debe fallar, no cascadear).

-- 2. Índice único parcial — cierra la race condition del find-or-create (G5)
create unique index if not exists contacts_branch_phone_uniq
  on public.contacts (branch_id, phone)
  where phone is not null;

-- 3. Índice de soporte para queries por branch
create index if not exists idx_contacts_branch
  on public.contacts (branch_id);

-- 4. Backfill best-effort desde orders y movements (determinístico, sin adivinar)
--    Contactos huérfanos quedan con branch_id null → invisibles por RLS (fail-closed).
update public.contacts c
  set branch_id = o.branch_id
  from (
    select distinct on (contact_id) contact_id, branch_id
    from public.orders
    where contact_id is not null
    order by contact_id, created_at desc
  ) o
  where c.id = o.contact_id
    and c.branch_id is null;

update public.contacts c
  set branch_id = m.branch_id
  from (
    select distinct on (contact_id) contact_id, branch_id
    from public.movements
    where contact_id is not null
    order by contact_id, created_at desc
  ) m
  where c.id = m.contact_id
    and c.branch_id is null;

-- 5. Revocar grant de anon sobre contacts (G4)
--    El storefront escribe vía SECURITY DEFINER — anon nunca toca contacts directamente.
revoke all on table public.contacts from anon;

-- 6. Dropear las 4 policies actuales (permisivas: auth.role() = 'authenticated')
drop policy if exists "contacts_select_authenticated" on public.contacts;
drop policy if exists "contacts_insert_authenticated" on public.contacts;
drop policy if exists "contacts_update_authenticated" on public.contacts;
drop policy if exists "contacts_delete_authenticated" on public.contacts;

-- 7. Dropear la firma vieja de 2 args.
--    CRÍTICO: CREATE OR REPLACE con distinta lista de tipos crea un overload
--    y deja viva la versión insegura. Hay que dropar explícitamente.
drop function if exists public._find_or_create_contact(text, text);

-- 8. Nueva _find_or_create_contact con branch_id como primer arg (obligatorio, sin default)
create or replace function public._find_or_create_contact(
  p_branch_id      uuid,    -- sin default: un caller que lo olvide falla en resolución
  p_customer_name  text,
  p_customer_phone text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_contact_id uuid;
begin
  if p_branch_id is null then
    raise exception 'branch_id requerido para contacto' using errcode = 'VC400';
  end if;

  -- Lookup por (branch_id, phone) — no global por phone
  select id into v_contact_id
    from public.contacts
    where branch_id = p_branch_id
      and phone = p_customer_phone
    limit 1;

  if v_contact_id is null then
    -- ON CONFLICT apoyado en contacts_branch_phone_uniq cierra la race condition (G5)
    insert into public.contacts (branch_id, full_name, phone, ci)
    values (p_branch_id, trim(p_customer_name), p_customer_phone, null)
    on conflict (branch_id, phone) where phone is not null
      do update set full_name = public.contacts.full_name  -- no-op, sólo para RETURNING
    returning id into v_contact_id;
  end if;

  return v_contact_id;
end;
$$;

-- =============================================================================
-- 9. Recrear create_storefront_order
--    Cuerpo: 20260909020000_sequential_order_codes.sql (order codes secuenciales).
--    IGNORAR el cuerpo de 20260910000000 (volvió a gen_random_bytes — regresión).
--    Único cambio: _find_or_create_contact ahora recibe v_branch.id como primer arg.
-- =============================================================================

create or replace function public.create_storefront_order(
  p_slug             text,
  p_customer_name    text,
  p_customer_phone   text,
  p_customer_email   text    default null,
  p_note             text    default null,
  p_items            jsonb   default '[]'::jsonb,
  p_payment_method   text    default 'efectivo',
  p_delivery_type    text    default 'pickup',
  p_delivery_address text    default null,
  p_customer_lat     float8  default null,
  p_customer_lng     float8  default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_branch      record;
  v_order_id    uuid;
  v_order_code  text;
  v_total       integer := 0;
  v_message     text;
  v_items_out   jsonb := '[]'::jsonb;
  v_line        jsonb;
  v_priced      record;
  v_contact_id  uuid;
  v_location    jsonb := null;
begin
  -- 1. Branch activa con storefront habilitado.
  select id, name, whatsapp_number
    into v_branch
    from public.branches
    where slug = p_slug
      and is_active
      and storefront_enabled
    limit 1;

  if v_branch.id is null then
    raise exception 'Tienda no disponible' using errcode = 'VC404';
  end if;

  -- 2. Validaciones de campos del cliente.
  if p_customer_name is null or length(trim(p_customer_name)) < 2 then
    raise exception 'Nombre invalido' using errcode = 'VC400';
  end if;

  if p_customer_phone is null or p_customer_phone !~ '^\+?[0-9 ()-]{7,20}$' then
    raise exception 'Telefono invalido' using errcode = 'VC400';
  end if;

  if p_customer_email is not null and p_customer_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Email invalido' using errcode = 'VC400';
  end if;

  if p_payment_method not in ('efectivo', 'transferencia') then
    raise exception 'Metodo de pago invalido' using errcode = 'VC400';
  end if;

  if p_delivery_type not in ('pickup', 'delivery') then
    raise exception 'Tipo de entrega invalido' using errcode = 'VC400';
  end if;

  -- Delivery requiere dirección de texto O coordenadas GPS (o ambas).
  if p_delivery_type = 'delivery'
     and (p_delivery_address is null or length(trim(p_delivery_address)) = 0)
     and p_customer_lat is null then
    raise exception 'Direccion o ubicacion GPS requerida para delivery' using errcode = 'VC400';
  end if;

  -- Coordenadas: ambas o ninguna.
  if (p_customer_lat is null) <> (p_customer_lng is null) then
    raise exception 'Latitud y longitud deben enviarse juntas' using errcode = 'VC400';
  end if;

  -- 3. Rate limiting.
  if (
    select count(*) from public.orders
    where branch_id = v_branch.id
      and created_at > now() - interval '1 minute'
  ) >= 5 then
    raise exception 'Demasiados pedidos, espera un minuto' using errcode = 'VC429';
  end if;

  if (
    select count(*) from public.orders
    where branch_id = v_branch.id
      and customer_phone = p_customer_phone
      and created_at > now() - interval '10 minutes'
  ) >= 3 then
    raise exception 'Demasiados pedidos, espera un minuto' using errcode = 'VC429';
  end if;

  -- 4. Calcular items server-side (precios ignorados del cliente).
  for v_priced in select * from public._price_order_items(v_branch.id, p_items)
  loop
    v_line := jsonb_build_object(
      'name',       v_priced.name,
      'qty',        v_priced.qty,
      'unit_price', v_priced.unit_price,
      'line_total', v_priced.line_total
    );
    v_items_out := v_items_out || jsonb_build_array(v_line);
    v_total := v_total + v_priced.line_total;
  end loop;

  -- 5. Find-or-create contacto — ahora por (branch_id, phone).
  v_contact_id := public._find_or_create_contact(v_branch.id, p_customer_name, p_customer_phone);

  -- 6. Construir location JSON si se enviaron coordenadas.
  if p_customer_lat is not null then
    v_location := jsonb_build_object('lat', p_customer_lat, 'lng', p_customer_lng);
  end if;

  -- 7. Generar código de pedido (secuencial) y mensaje de WhatsApp.
  v_order_code := lpad(nextval('public.order_number_seq')::text, 4, '0');

  v_message := '*Pedido #' || v_order_code || '* — ' || v_branch.name || E'\n\n'
    || '*Cliente:* ' || p_customer_name || E'\n'
    || '*Telefono:* ' || p_customer_phone || E'\n\n'
    || '*Pedido:*' || E'\n';

  for v_line in select * from jsonb_array_elements(v_items_out)
  loop
    v_message := v_message
      || '• ' || (v_line->>'qty') || 'x ' || (v_line->>'name')
      || ' — Gs. ' || public.format_gs((v_line->>'line_total')::int) || E'\n';
  end loop;

  if p_note is not null and length(trim(p_note)) > 0 then
    v_message := v_message || E'\n' || '*Nota:* ' || trim(p_note) || E'\n';
  end if;

  v_message := v_message || E'\n' || '*Pago:* '
    || (case when p_payment_method = 'efectivo' then 'Efectivo' else 'Transferencia' end) || E'\n';

  if p_delivery_type = 'delivery' then
    v_message := v_message || '*Entrega:* Delivery';
    if p_delivery_address is not null and length(trim(p_delivery_address)) > 0 then
      v_message := v_message || ' — ' || trim(p_delivery_address);
    end if;
    v_message := v_message || E'\n';
    -- Link de Maps si hay coordenadas
    if p_customer_lat is not null then
      v_message := v_message
        || E'📍 https://maps.google.com/?q='
        || p_customer_lat || ',' || p_customer_lng || E'\n';
    end if;
    v_message := v_message
      || E'\n' || '*Subtotal: Gs. ' || public.format_gs(v_total) || '*' || E'\n'
      || '_Costo de delivery: a confirmar por el local_';
  else
    v_message := v_message || '*Entrega:* Retiro en el local' || E'\n'
      || E'\n' || '*Total: Gs. ' || public.format_gs(v_total) || '*';
  end if;

  -- 8. Insertar pedido.
  insert into public.orders (
    branch_id, order_code, customer_name, customer_phone, customer_email,
    contact_id, note, status, total, whatsapp_message,
    payment_method, delivery_type, delivery_address,
    delivery_fee, delivery_location
  ) values (
    v_branch.id, v_order_code, trim(p_customer_name), p_customer_phone, p_customer_email,
    v_contact_id, p_note, 'pending', v_total, v_message,
    p_payment_method, p_delivery_type,
    nullif(trim(coalesce(p_delivery_address, '')), ''),
    null,
    v_location
  )
  returning id into v_order_id;

  for v_priced in select * from public._price_order_items(v_branch.id, p_items)
  loop
    insert into public.order_items (order_id, service_id, name_snapshot, unit_price, qty, line_total)
    values (v_order_id, v_priced.service_id, v_priced.name, v_priced.unit_price, v_priced.qty, v_priced.line_total);
  end loop;

  return jsonb_build_object(
    'order_id',         v_order_id,
    'order_code',       v_order_code,
    'total',            v_total,
    'delivery_fee',     null,
    'whatsapp_number',  v_branch.whatsapp_number,
    'whatsapp_message', v_message,
    'items',            v_items_out
  );
end;
$$;

-- =============================================================================
-- 10. Recrear create_manual_order
--     Cuerpo: 20260901040000_rename_role_barber_to_user.sql (versión vigente).
--     Único cambio: _find_or_create_contact ahora recibe p_branch_id como primer arg.
-- =============================================================================

create or replace function public.create_manual_order(
  p_branch_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text default null,
  p_note text default null,
  p_items jsonb default '[]'::jsonb,
  p_payment_method text default 'efectivo',
  p_delivery_type text default 'pickup',
  p_delivery_address text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_branch record;
  v_item jsonb;
  v_order_id uuid;
  v_order_code text;
  v_total integer := 0;
  v_message text;
  v_items_out jsonb := '[]'::jsonb;
  v_line jsonb;
  v_priced record;
  v_contact_id uuid;
begin
  -- 1. Authorization: caller must be admin/user of this branch.
  if not exists (
    select 1 from public.user_branch_access
    where branch_id = p_branch_id
      and user_id = auth.uid()
      and role in ('admin', 'user')
  ) then
    raise exception 'No autorizado' using errcode = 'VC403';
  end if;

  select id, name, whatsapp_number
    into v_branch
    from public.branches
    where id = p_branch_id
    limit 1;

  if v_branch.id is null then
    raise exception 'Sucursal no encontrada' using errcode = 'VC404';
  end if;

  if p_customer_name is null or length(trim(p_customer_name)) < 2 then
    raise exception 'Nombre invalido' using errcode = 'VC400';
  end if;

  if p_customer_phone is null or p_customer_phone !~ '^\+?[0-9 ()-]{7,20}$' then
    raise exception 'Telefono invalido' using errcode = 'VC400';
  end if;

  if p_customer_email is not null and p_customer_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Email invalido' using errcode = 'VC400';
  end if;

  if p_payment_method not in ('efectivo', 'transferencia') then
    raise exception 'Metodo de pago invalido' using errcode = 'VC400';
  end if;

  if p_delivery_type not in ('pickup', 'delivery') then
    raise exception 'Tipo de entrega invalido' using errcode = 'VC400';
  end if;

  if p_delivery_type = 'delivery' and (p_delivery_address is null or length(trim(p_delivery_address)) = 0) then
    raise exception 'Direccion requerida para delivery' using errcode = 'VC400';
  end if;

  for v_priced in select * from public._price_order_items(v_branch.id, p_items)
  loop
    v_line := jsonb_build_object(
      'name', v_priced.name,
      'qty', v_priced.qty,
      'unit_price', v_priced.unit_price,
      'line_total', v_priced.line_total
    );
    v_items_out := v_items_out || jsonb_build_array(v_line);
    v_total := v_total + v_priced.line_total;
  end loop;

  -- Find-or-create contacto — ahora por (branch_id, phone).
  v_contact_id := public._find_or_create_contact(p_branch_id, p_customer_name, p_customer_phone);

  v_order_code := upper(substr(encode(extensions.gen_random_bytes(3), 'hex'), 1, 6));

  v_message := '*Pedido #' || v_order_code || '* — ' || v_branch.name || E'\n\n'
    || '*Cliente:* ' || p_customer_name || E'\n'
    || '*Telefono:* ' || p_customer_phone || E'\n\n'
    || '*Pedido:*' || E'\n';

  for v_line in select * from jsonb_array_elements(v_items_out)
  loop
    v_message := v_message || '• ' || (v_line->>'qty') || 'x ' || (v_line->>'name')
      || ' — Gs. ' || public.format_gs((v_line->>'line_total')::int) || E'\n';
  end loop;

  if p_note is not null and length(trim(p_note)) > 0 then
    v_message := v_message || E'\n' || '*Nota:* ' || trim(p_note) || E'\n';
  end if;

  v_message := v_message || E'\n' || '*Pago:* '
    || (case when p_payment_method = 'efectivo' then 'Efectivo' else 'Transferencia' end) || E'\n';

  if p_delivery_type = 'delivery' then
    v_message := v_message || '*Entrega:* Delivery — ' || trim(p_delivery_address) || E'\n';
  else
    v_message := v_message || '*Entrega:* Retiro en el local' || E'\n';
  end if;

  v_message := v_message || E'\n' || '*Total: Gs. ' || public.format_gs(v_total) || '*';

  insert into public.orders (
    branch_id, order_code, customer_name, customer_phone, customer_email,
    contact_id, note, status, total, whatsapp_message,
    payment_method, delivery_type, delivery_address
  ) values (
    v_branch.id, v_order_code, trim(p_customer_name), p_customer_phone, p_customer_email,
    v_contact_id, p_note, 'pending', v_total, v_message,
    p_payment_method, p_delivery_type, nullif(trim(coalesce(p_delivery_address, '')), '')
  )
  returning id into v_order_id;

  for v_priced in select * from public._price_order_items(v_branch.id, p_items)
  loop
    insert into public.order_items (order_id, service_id, name_snapshot, unit_price, qty, line_total)
    values (v_order_id, v_priced.service_id, v_priced.name, v_priced.unit_price, v_priced.qty, v_priced.line_total);
  end loop;

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_code', v_order_code,
    'total', v_total,
    'whatsapp_number', v_branch.whatsapp_number,
    'whatsapp_message', v_message,
    'items', v_items_out
  );
end;
$$;

-- =============================================================================
-- 11. Recrear update_order
--     Cuerpo: 20260910000000_storefront_delivery_v2.sql (11 args, con p_delivery_fee).
--     Único cambio: _find_or_create_contact ahora recibe v_order.branch_id como primer arg.
-- =============================================================================

create or replace function public.update_order(
  p_order_id         uuid,
  p_customer_name    text,
  p_customer_phone   text,
  p_customer_email   text,
  p_note             text,
  p_payment_method   text,
  p_delivery_type    text,
  p_delivery_address text,
  p_status           text,
  p_items            jsonb,
  p_delivery_fee     integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order          record;
  v_items_total    integer := 0;
  v_final_total    integer;
  v_contact_id     uuid;
  v_priced         record;
  v_existing_fee   integer;
begin
  -- 1. El pedido debe existir.
  select id, branch_id, contact_id, customer_phone, delivery_fee
    into v_order
    from public.orders
    where id = p_order_id
    limit 1;

  if v_order.id is null then
    raise exception 'Pedido no encontrado' using errcode = 'VC404';
  end if;

  -- 2. Autorización: admin/barber de la sucursal.
  if not exists (
    select 1 from public.user_branch_access
    where branch_id = v_order.branch_id
      and user_id = auth.uid()
      and role in ('admin', 'barber')
  ) then
    raise exception 'No autorizado' using errcode = 'VC403';
  end if;

  -- 3. Validaciones.
  if p_customer_name is null or length(trim(p_customer_name)) < 2 then
    raise exception 'Nombre invalido' using errcode = 'VC400';
  end if;

  if p_customer_phone is null or p_customer_phone !~ '^\+?[0-9 ()-]{7,20}$' then
    raise exception 'Telefono invalido' using errcode = 'VC400';
  end if;

  if p_customer_email is not null and p_customer_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Email invalido' using errcode = 'VC400';
  end if;

  if p_payment_method not in ('efectivo', 'transferencia') then
    raise exception 'Metodo de pago invalido' using errcode = 'VC400';
  end if;

  if p_delivery_type not in ('pickup', 'delivery') then
    raise exception 'Tipo de entrega invalido' using errcode = 'VC400';
  end if;

  if p_delivery_type = 'delivery'
     and (p_delivery_address is null or length(trim(p_delivery_address)) = 0) then
    raise exception 'Direccion requerida para delivery' using errcode = 'VC400';
  end if;

  if p_status not in ('pending', 'confirmed', 'completed', 'cancelled') then
    raise exception 'Estado invalido' using errcode = 'VC400';
  end if;

  -- 4. Re-calcular items server-side.
  for v_priced in select * from public._price_order_items(v_order.branch_id, p_items)
  loop
    v_items_total := v_items_total + v_priced.line_total;
  end loop;

  -- 5. Total final = items + delivery_fee (si aplica).
  v_existing_fee := coalesce(v_order.delivery_fee, 0);
  if p_delivery_type = 'delivery' then
    v_final_total := v_items_total + coalesce(p_delivery_fee, v_existing_fee);
  else
    v_final_total := v_items_total;
  end if;

  -- 6. Find-or-create contacto — ahora por (branch_id, phone).
  v_contact_id := public._find_or_create_contact(v_order.branch_id, p_customer_name, p_customer_phone);

  -- 7. Reemplazar order_items con precios actualizados.
  delete from public.order_items where order_id = p_order_id;

  for v_priced in select * from public._price_order_items(v_order.branch_id, p_items)
  loop
    insert into public.order_items (order_id, service_id, name_snapshot, unit_price, qty, line_total)
    values (p_order_id, v_priced.service_id, v_priced.name, v_priced.unit_price, v_priced.qty, v_priced.line_total);
  end loop;

  -- 8. Actualizar el pedido.
  update public.orders
    set customer_name    = trim(p_customer_name),
        customer_phone   = p_customer_phone,
        customer_email   = p_customer_email,
        contact_id       = v_contact_id,
        note             = p_note,
        payment_method   = p_payment_method,
        delivery_type    = p_delivery_type,
        delivery_address = nullif(trim(coalesce(p_delivery_address, '')), ''),
        status           = p_status::public.order_status,
        total            = v_final_total,
        delivery_fee     = case
          when p_delivery_type = 'delivery' and p_delivery_fee is not null
            then p_delivery_fee
          when p_delivery_type = 'pickup'
            then 0
          else delivery_fee
        end
    where id = p_order_id;

  return jsonb_build_object(
    'order_id',     p_order_id,
    'total',        v_final_total,
    'delivery_fee', case
      when p_delivery_type = 'delivery' then coalesce(p_delivery_fee, v_existing_fee)
      else 0
    end
  );
end;
$$;

-- =============================================================================
-- 12. Nuevas policies de contacts usando has_branch_access(branch_id)
--     fail-closed: has_branch_access(null) → false (el NULL interno en EXISTS da false)
-- =============================================================================

create policy "contacts_select_branch_access"
  on public.contacts
  for select
  to authenticated
  using (public.has_branch_access(branch_id));

create policy "contacts_insert_branch_access"
  on public.contacts
  for insert
  to authenticated
  with check (public.has_branch_access(branch_id));

create policy "contacts_update_branch_access"
  on public.contacts
  for update
  to authenticated
  using (public.has_branch_access(branch_id))
  with check (public.has_branch_access(branch_id));  -- impide mover un contacto a otra branch

create policy "contacts_delete_branch_access"
  on public.contacts
  for delete
  to authenticated
  using (public.has_branch_access(branch_id));

-- =============================================================================
-- DOWN (manual — no se dropea la columna para no perder datos):
-- =============================================================================
-- revoke all on function public.update_order(uuid,text,text,text,text,text,text,text,text,jsonb,integer) from public;
-- grant execute on function public.update_order(uuid,text,text,text,text,text,text,text,text,jsonb,integer) to authenticated;
--
-- drop function if exists public._find_or_create_contact(uuid, text, text);
-- -- Recrear _find_or_create_contact(text, text) desde 20260901010000_orders_expansion.sql
-- -- Recrear create_storefront_order desde 20260909020000_sequential_order_codes.sql (sin branch_id)
-- -- Recrear create_manual_order desde 20260901040000_rename_role_barber_to_user.sql (sin branch_id)
-- -- Recrear update_order desde 20260910000000_storefront_delivery_v2.sql (sin branch_id)
--
-- drop policy if exists "contacts_select_branch_access" on public.contacts;
-- drop policy if exists "contacts_insert_branch_access" on public.contacts;
-- drop policy if exists "contacts_update_branch_access" on public.contacts;
-- drop policy if exists "contacts_delete_branch_access" on public.contacts;
--
-- create policy "contacts_select_authenticated" on public.contacts for select using (auth.role() = 'authenticated');
-- create policy "contacts_insert_authenticated" on public.contacts for insert with check (auth.role() = 'authenticated');
-- create policy "contacts_update_authenticated" on public.contacts for update using (auth.role() = 'authenticated');
-- create policy "contacts_delete_authenticated" on public.contacts for delete using (auth.role() = 'authenticated');
--
-- grant all on table public.contacts to anon;
-- drop index if exists contacts_branch_phone_uniq;
-- drop index if exists idx_contacts_branch;
-- -- (no ALTER TABLE DROP COLUMN — la columna queda inerte)
