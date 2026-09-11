-- =============================================================================
-- A3: create_manual_order usaba gen_random_bytes (regresión del apply agent).
--     Restaura códigos secuenciales con order_number_seq (igual que create_storefront_order).
-- A4: _price_order_items se llamaba dos veces. Ahora la segunda pasada usa
--     v_items_out (ya construido en la primera) para insertar order_items.
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
  -- 1. Autorización: el caller debe ser admin/user de la sucursal.
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

  -- 2. Calcular items server-side. Incluimos service_id para usarlo en el INSERT
  --    sin necesidad de llamar a _price_order_items una segunda vez (A4).
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

  -- 3. Find-or-create contacto por (branch_id, phone).
  v_contact_id := public._find_or_create_contact(p_branch_id, p_customer_name, p_customer_phone);

  -- 4. Código secuencial (A3: corrige regresión que usaba gen_random_bytes).
  v_order_code := lpad(nextval('public.order_number_seq')::text, 4, '0');

  -- 5. Mensaje de WhatsApp.
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

  -- 6. Insertar pedido.
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

  -- 7. Insertar order_items desde v_items_out (A4: sin segunda llamada a _price_order_items).
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
