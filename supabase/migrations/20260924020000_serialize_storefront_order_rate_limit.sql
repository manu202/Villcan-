-- O-5: no unique constraint, advisory lock, or idempotency key on
-- cart/customer/time window. create_storefront_order's rate-limit checks
-- (5/min/branch, 3/10min/phone) were two `select count(*)` reads followed
-- by an INSERT, with nothing serializing concurrent calls -- two
-- near-simultaneous submits (a customer double-tapping "confirmar" on a
-- slow connection, or two browser tabs) could each read the count as
-- under-limit before either committed, both pass, and both insert.
--
-- Fix: pg_advisory_xact_lock keyed on (branch_id, phone) right after
-- resolving the branch, before either count check. Each RPC call is its
-- own transaction, so the lock is held until that call's INSERT commits --
-- a second concurrent call for the same branch+phone queues behind it and
-- only runs its own count check once the first has actually landed,
-- making the rate limit atomic against that specific race. Different
-- phones (or different branches) never block each other.
--
-- Body otherwise identical to the current live definition.

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
     and (p_delivery_address is null or length(trim(p_delivery_address)) = 0)
     and p_customer_lat is null then
    raise exception 'Direccion o ubicacion GPS requerida para delivery' using errcode = 'VC400';
  end if;

  if (p_customer_lat is null) <> (p_customer_lng is null) then
    raise exception 'Latitud y longitud deben enviarse juntas' using errcode = 'VC400';
  end if;

  -- O-5 fix: serialize concurrent submits for the same branch+phone before
  -- either rate-limit count check runs.
  perform pg_advisory_xact_lock(hashtext(v_branch.id::text || ':' || p_customer_phone));

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

  v_contact_id := public._find_or_create_contact(v_branch.id, p_customer_name, p_customer_phone);

  if p_customer_lat is not null then
    v_location := jsonb_build_object('lat', p_customer_lat, 'lng', p_customer_lng);
  end if;

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
