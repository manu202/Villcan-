-- Sequential order codes: replace random hex (e.g. A1B2C3) with a
-- global auto-incrementing counter formatted as zero-padded digits
-- (0001, 0002, ... 9999, 10000, ...).
--
-- Approach: a single Postgres sequence `order_number_seq`. Every call
-- to nextval() returns a strictly increasing integer; lpad() zero-fills
-- to 4 digits for codes 1-9999, then grows naturally past that.
--
-- Builds on: 20260910000000_storefront_delivery_v2.sql (current function
-- signature). The only change inside create_storefront_order is the
-- single line that assigns v_order_code.

-- ============================================================================
-- 1. Sequence
-- ============================================================================

create sequence if not exists public.order_number_seq start 1;

-- ============================================================================
-- 2. create_storefront_order — replace random code with sequence
--    Full body required because CREATE OR REPLACE replaces the whole function.
-- ============================================================================

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

-- ============================================================================
-- Rollback (manual):
-- ============================================================================
-- drop sequence if exists public.order_number_seq;
-- -- Restaurar la versión anterior de create_storefront_order desde
-- -- 20260910000000_storefront_delivery_v2.sql (cambia v_order_code de
-- -- lpad/nextval de vuelta a upper/substr/encode/gen_random_bytes).
