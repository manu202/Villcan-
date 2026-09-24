-- O-7 / P-4: order codes shared one global sequence (order_number_seq)
-- across every branch. A jump in a branch's own numbering gives no signal
-- of which branch or how much real volume; a rolled-back transaction
-- anywhere burns a value permanently, reading as a "missing order" to
-- anyone reconciling by code in a specific branch. Each branch now gets
-- its own counter, starting at 1.
--
-- Backend-only: order_code stays a 4-digit zero-padded text string, same
-- shape the UI already renders (OrderCard.tsx etc.) -- nothing in src/
-- needs to change for this.

alter table public.branches
  add column if not exists next_order_number integer not null default 1;

-- Backfill: continue each branch's counter after its own highest existing
-- numeric order_code (legacy hex-style codes from before the 2026-09-09
-- sequential-codes migration are ignored -- they don't collide with the
-- zero-padded numeric format regardless). Branches with no numeric orders
-- yet keep the column default of 1.
update public.branches b
set next_order_number = m.max_code + 1
from (
  select branch_id, max(order_code::int) as max_code
  from public.orders
  where order_code ~ '^[0-9]+$'
  group by branch_id
) m
where m.branch_id = b.id;

-- Atomic increment-and-return. The UPDATE's row lock serializes concurrent
-- callers for the same branch (two staff creating orders in the same
-- branch at the same instant can't get the same number); different
-- branches don't block each other at all.
create or replace function public._next_order_code(p_branch_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_number integer;
begin
  update public.branches
    set next_order_number = next_order_number + 1
    where id = p_branch_id
    returning next_order_number - 1 into v_number;

  if v_number is null then
    raise exception 'Sucursal no encontrada' using errcode = 'VC404';
  end if;

  return lpad(v_number::text, 4, '0');
end;
$$;

revoke all on function public._next_order_code(uuid) from public;

-- create_storefront_order: swap the global sequence for the per-branch
-- counter. Body otherwise identical to the current live definition.
create or replace function public.create_storefront_order(
  p_slug text,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text default null,
  p_note text default null,
  p_items jsonb default '[]'::jsonb,
  p_payment_method text default 'efectivo',
  p_delivery_type text default 'pickup',
  p_delivery_address text default null,
  p_customer_lat double precision default null,
  p_customer_lng double precision default null
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

  -- 4. Calcular items server-side. Incluimos service_id para reutilizar en
  --    el INSERT sin llamar a _price_order_items una segunda vez (A4).
  for v_priced in select * from public._price_order_items(v_branch.id, p_items)
  loop
    v_line := jsonb_build_object(
      'service_id', v_priced.service_id,
      'name',       v_priced.name,
      'qty',        v_priced.qty,
      'unit_price', v_priced.unit_price,
      'line_total', v_priced.line_total
    );
    v_items_out := v_items_out || jsonb_build_array(v_line);
    v_total := v_total + v_priced.line_total;
  end loop;

  -- 5. Find-or-create contacto — por (branch_id, phone).
  v_contact_id := public._find_or_create_contact(v_branch.id, p_customer_name, p_customer_phone);

  -- 6. Construir location JSON si se enviaron coordenadas.
  if p_customer_lat is not null then
    v_location := jsonb_build_object('lat', p_customer_lat, 'lng', p_customer_lng);
  end if;

  -- 7. Generar código de pedido (secuencial, por sucursal -- O-7/P-4) y
  --    mensaje de WhatsApp.
  v_order_code := public._next_order_code(v_branch.id);

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

  -- 9. Insertar order_items desde v_items_out (A4: sin segunda llamada a _price_order_items).
  for v_line in select * from jsonb_array_elements(v_items_out)
  loop
    insert into public.order_items (order_id, service_id, name_snapshot, unit_price, qty, line_total)
    values (
      v_order_id,
      (v_line->>'service_id')::uuid,
      v_line->>'name',
      (v_line->>'unit_price')::integer,
      (v_line->>'qty')::integer,
      (v_line->>'line_total')::integer
    );
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

-- create_manual_order: swap the global sequence for the per-branch counter.
-- Body otherwise identical to the current live definition.
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
  v_branch      record;
  v_order_id    uuid;
  v_order_code  text;
  v_total       integer := 0;
  v_message     text;
  v_items_out   jsonb := '[]'::jsonb;
  v_line        jsonb;
  v_priced      record;
  v_contact_id  uuid;
begin
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

  if p_payment_method not in ('efectivo', 'transferencia', 'pos') then
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
      'service_id', v_priced.service_id,
      'name',       v_priced.name,
      'qty',        v_priced.qty,
      'unit_price', v_priced.unit_price,
      'line_total', v_priced.line_total
    );
    v_items_out := v_items_out || jsonb_build_array(v_line);
    v_total := v_total + v_priced.line_total;
  end loop;

  v_contact_id := public._find_or_create_contact(p_branch_id, p_customer_name, p_customer_phone);

  v_order_code := public._next_order_code(v_branch.id);

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
    || (case p_payment_method
          when 'efectivo' then 'Efectivo'
          when 'pos' then 'POS'
          else 'Transferencia'
        end) || E'\n';

  if p_delivery_type = 'delivery' then
    v_message := v_message || '*Entrega:* Delivery — ' || trim(p_delivery_address) || E'\n';
  else
    v_message := v_message || '*Entrega:* Retiro en el local' || E'\n';
  end if;

  v_message := v_message || E'\n' || '*Total: Gs. ' || public.format_gs(v_total) || '*';

  perform set_config('app.bypass_order_guard', 'on', true);

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

  for v_line in select * from jsonb_array_elements(v_items_out)
  loop
    insert into public.order_items (order_id, service_id, name_snapshot, unit_price, qty, line_total)
    values (
      v_order_id,
      (v_line->>'service_id')::uuid,
      v_line->>'name',
      (v_line->>'unit_price')::integer,
      (v_line->>'qty')::integer,
      (v_line->>'line_total')::integer
    );
  end loop;

  return jsonb_build_object(
    'order_id',        v_order_id,
    'order_code',      v_order_code,
    'total',           v_total,
    'whatsapp_number', v_branch.whatsapp_number,
    'whatsapp_message', v_message,
    'items',           v_items_out
  );
end;
$$;
