-- O-6: update_order accepted p_delivery_fee with no range check (only the
-- aggregate `orders.total >= 0` CHECK existed) -- a negative delivery fee
-- could reduce a completed order's recorded total. confirm_order_delivery_fee
-- already validates this correctly; update_order never got the same check.
-- Body otherwise identical to the current live definition (20260922050000).

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
  v_priced_items   jsonb := '[]'::jsonb;
  v_item           jsonb;
begin
  select id, branch_id, contact_id, customer_phone, delivery_fee, status
    into v_order
    from public.orders
    where id = p_order_id
    limit 1;

  if v_order.id is null then
    raise exception 'Pedido no encontrado' using errcode = 'VC404';
  end if;

  if v_order.status in ('completed', 'cancelled') then
    raise exception 'No se puede editar un pedido completado o cancelado' using errcode = 'VC409';
  end if;

  if not exists (
    select 1 from public.user_branch_access
    where branch_id = v_order.branch_id
      and user_id = auth.uid()
      and role in ('admin', 'user')
  ) then
    raise exception 'No autorizado' using errcode = 'VC403';
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

  if p_delivery_type = 'delivery'
     and (p_delivery_address is null or length(trim(p_delivery_address)) = 0) then
    raise exception 'Direccion requerida para delivery' using errcode = 'VC400';
  end if;

  if p_status not in ('pending', 'confirmed', 'completed', 'cancelled') then
    raise exception 'Estado invalido' using errcode = 'VC400';
  end if;

  -- O-6 fix: reject a negative delivery fee before it ever reaches the total.
  if p_delivery_fee is not null and p_delivery_fee < 0 then
    raise exception 'Costo de delivery invalido' using errcode = 'VC400';
  end if;

  for v_priced in select * from public._price_order_items(v_order.branch_id, p_items)
  loop
    v_items_total := v_items_total + v_priced.line_total;
    v_priced_items := v_priced_items || jsonb_build_array(jsonb_build_object(
      'service_id', v_priced.service_id,
      'name',       v_priced.name,
      'unit_price', v_priced.unit_price,
      'qty',        v_priced.qty,
      'line_total', v_priced.line_total
    ));
  end loop;

  v_existing_fee := coalesce(v_order.delivery_fee, 0);
  if p_delivery_type = 'delivery' then
    v_final_total := v_items_total + coalesce(p_delivery_fee, v_existing_fee);
  else
    v_final_total := v_items_total;
  end if;

  v_contact_id := public._find_or_create_contact(v_order.branch_id, p_customer_name, p_customer_phone);

  delete from public.order_items where order_id = p_order_id;

  for v_item in select * from jsonb_array_elements(v_priced_items)
  loop
    insert into public.order_items (order_id, service_id, name_snapshot, unit_price, qty, line_total)
    values (
      p_order_id,
      (v_item->>'service_id')::uuid,
      v_item->>'name',
      (v_item->>'unit_price')::integer,
      (v_item->>'qty')::integer,
      (v_item->>'line_total')::integer
    );
  end loop;

  perform set_config('app.bypass_order_guard', 'on', true);

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
