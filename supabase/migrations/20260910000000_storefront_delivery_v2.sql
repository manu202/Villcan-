-- storefront_delivery_v2
-- Builds on top of 20260901010000_orders_expansion.sql
--
-- Adds:
--   orders.delivery_fee (integer, nullable — NULL = pendiente confirmación del staff)
--   orders.delivery_location (jsonb nullable — { "lat": float, "lng": float } del cliente)
--   delivery_tiers — tabla de sugerencias de costo por distancia (uso interno del staff)
--
--   create_storefront_order: reemplaza la firma de 9 args por 11 args
--     (+p_customer_lat, +p_customer_lng). delivery_fee queda NULL al crear
--     (lo confirma el staff). Acepta entrega con GPS sin dirección de texto.
--     Incluye link de Maps y "Costo de delivery: a confirmar" en el mensaje WA.
--
--   update_order: reemplaza la firma de 10 args por 11 args
--     (+p_delivery_fee integer default null). Cuando se pasa, actualiza
--     delivery_fee y recalcula total = items_subtotal + delivery_fee.
--
-- Rollback al final (comentado).

-- ============================================================================
-- 1. orders: delivery_fee y delivery_location
-- ============================================================================

alter table public.orders
  add column if not exists delivery_fee integer,
  add column if not exists delivery_location jsonb;

-- ============================================================================
-- 2. delivery_tiers — sugerencias de costo por km (uso del staff, no anon)
-- ============================================================================

create table if not exists public.delivery_tiers (
  id         uuid    default gen_random_uuid() primary key,
  branch_id  uuid    not null references public.branches(id) on delete cascade,
  max_km     numeric(5,2) not null check (max_km > 0),
  fee        integer not null check (fee >= 0),
  sort_order integer not null default 0,
  created_at timestamptz default now()
);

create index if not exists idx_delivery_tiers_branch
  on public.delivery_tiers (branch_id, sort_order);

alter table public.delivery_tiers enable row level security;

-- Branch members can read their branch's tiers (to show suggestions in back-office)
create policy "delivery_tiers_select_branch_members"
  on public.delivery_tiers for select to authenticated
  using (
    exists (
      select 1 from public.user_branch_access uba
      where uba.branch_id = delivery_tiers.branch_id
        and uba.user_id = auth.uid()
    )
  );

-- Only branch admins can write tiers
create policy "delivery_tiers_write_branch_admins"
  on public.delivery_tiers for all to authenticated
  using (
    exists (
      select 1 from public.user_branch_access uba
      where uba.branch_id = delivery_tiers.branch_id
        and uba.user_id = auth.uid()
        and uba.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.user_branch_access uba
      where uba.branch_id = delivery_tiers.branch_id
        and uba.user_id = auth.uid()
        and uba.role = 'admin'
    )
  );

-- ============================================================================
-- 3. create_storefront_order — 9 args → 11 args (+ lat / lng)
--    Drop old signature explicitly: CREATE OR REPLACE no reemplaza cuando
--    cambia la lista de parámetros — deja el viejo y el nuevo conviviendo.
-- ============================================================================

drop function if exists public.create_storefront_order(
  text, text, text, text, text, jsonb, text, text, text
);

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

  -- 3. Rate limiting (misma lógica que antes).
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

  -- 5. Find-or-create contacto.
  v_contact_id := public._find_or_create_contact(p_customer_name, p_customer_phone);

  -- 6. Construir location JSON si se enviaron coordenadas.
  if p_customer_lat is not null then
    v_location := jsonb_build_object('lat', p_customer_lat, 'lng', p_customer_lng);
  end if;

  -- 7. Generar código de pedido y mensaje de WhatsApp.
  v_order_code := upper(substr(encode(extensions.gen_random_bytes(3), 'hex'), 1, 6));

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

  -- 8. Insertar pedido (delivery_fee = NULL → pendiente de confirmación).
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
    null,       -- delivery_fee: staff lo confirma después
    v_location  -- delivery_location: { lat, lng } o null
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

revoke all on function public.create_storefront_order(text, text, text, text, text, jsonb, text, text, text, float8, float8) from public;
grant execute on function public.create_storefront_order(text, text, text, text, text, jsonb, text, text, text, float8, float8) to anon, authenticated;

-- ============================================================================
-- 4. update_order — 10 args → 11 args (+ p_delivery_fee)
--    Cuando p_delivery_fee IS NOT NULL y delivery_type='delivery':
--      total = items_subtotal + delivery_fee
--    Cuando p_delivery_fee IS NULL: delivery_fee existente no se toca.
-- ============================================================================

drop function if exists public.update_order(
  uuid, text, text, text, text, text, text, text, text, jsonb
);

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

  -- 3. Validaciones (mismas reglas que create).
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
  --    p_delivery_fee IS NOT NULL → actualizar fee.
  --    p_delivery_fee IS NULL     → conservar el fee existente.
  v_existing_fee := coalesce(v_order.delivery_fee, 0);
  if p_delivery_type = 'delivery' then
    v_final_total := v_items_total + coalesce(p_delivery_fee, v_existing_fee);
  else
    v_final_total := v_items_total;
  end if;

  -- 6. Find-or-create contacto.
  v_contact_id := public._find_or_create_contact(p_customer_name, p_customer_phone);

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
          else delivery_fee  -- sin cambio
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

revoke all on function public.update_order(uuid, text, text, text, text, text, text, text, text, jsonb, integer) from public;
grant execute on function public.update_order(uuid, text, text, text, text, text, text, text, text, jsonb, integer) to authenticated;

-- ============================================================================
-- Rollback (manual):
-- ============================================================================
-- drop function if exists public.update_order(uuid, text, text, text, text, text, text, text, text, jsonb, integer);
-- drop function if exists public.create_storefront_order(text, text, text, text, text, jsonb, text, text, text, float8, float8);
-- -- Recrear las versiones anteriores desde 20260901010000_orders_expansion.sql
-- drop table if exists public.delivery_tiers;
-- alter table public.orders
--   drop column if exists delivery_location,
--   drop column if exists delivery_fee;
