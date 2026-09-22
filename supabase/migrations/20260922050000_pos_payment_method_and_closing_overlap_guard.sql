-- =============================================================================
-- pos_payment_method_and_closing_overlap_guard
--
-- Two unrelated fixes bundled into one migration/local-stack session to
-- minimize Docker contention (Phase 5, done directly per the plan — the
-- only two Phase 5 items needing a real migration).
--
-- 1. SW-M1: MovementForm.tsx's sale flow offers Efectivo/Transferencia/POS,
--    but orders.payment_method's CHECK constraint (and every order RPC's
--    own validation) only ever allowed 'efectivo'/'transferencia', so POS
--    sales were silently coerced to 'efectivo' client-side — inflating the
--    recorded cash total for a card sale and guaranteeing arqueo mismatches
--    with no visible cause. movements.payment_method already allowed 'pos'
--    (baseline.sql:194) — only orders never did.
--
--    Scope check: the public storefront checkout (CheckoutStep.tsx) only
--    ever offers Efectivo/Transferencia to the customer — correctly, since
--    POS (a card machine at the counter) is a staff-side collection method,
--    not something an online customer selects. create_storefront_order is
--    therefore NOT touched here — only the staff-facing paths are:
--    the orders table constraint, create_manual_order, and update_order.
--
-- 2. SW-C2: no constraint prevented two overlapping cash_closings for the
--    same branch+period — periodStart is computed client-side at load time,
--    so two concurrent admins (or a double-tap across tabs) could both read
--    the same "last closing" boundary and both insert, double-reporting the
--    same movements. Fixed with a BEFORE INSERT trigger that takes a
--    per-branch advisory lock (serializing concurrent inserts for the same
--    branch within the transaction) and rejects a new closing whose period
--    starts before the branch's latest existing closing already ended.
-- =============================================================================

-- 1a. Allow 'pos' as a stored orders.payment_method value.
alter table public.orders
  drop constraint if exists orders_payment_method_check;

alter table public.orders
  add constraint orders_payment_method_check
  check (payment_method in ('efectivo', 'transferencia', 'pos'));

-- 1b. update_order: allow 'pos' in validation. Body otherwise identical to
--     the current live definition (20260922000000, with the M-2 status
--     guard already in place).
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

-- 1c. create_manual_order: allow 'pos' in validation, and fix the WhatsApp
--     message's payment-method line (previously a binary
--     efectivo/else-transferencia case, which would have mislabeled a POS
--     sale as "Transferencia").
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

  v_order_code := lpad(nextval('public.order_number_seq')::text, 4, '0');

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

-- =============================================================================
-- 2. SW-C2 — prevent overlapping cash_closings for the same branch.
-- =============================================================================

create or replace function public._prevent_overlapping_closing()
returns trigger
language plpgsql
as $$
declare
  v_latest_closed_at timestamptz;
begin
  -- Serialize concurrent inserts for the same branch within this
  -- transaction (works even for a branch's very first closing, where
  -- there's no existing row yet to lock via SELECT ... FOR UPDATE).
  perform pg_advisory_xact_lock(hashtext(new.branch_id::text));

  select max(closed_at) into v_latest_closed_at
  from public.cash_closings
  where branch_id = new.branch_id;

  if v_latest_closed_at is not null and new.period_start < v_latest_closed_at then
    raise exception 'Ya existe un cierre posterior para esta sucursal — el período se superpone' using errcode = 'VC409';
  end if;

  return new;
end;
$$;

drop trigger if exists cash_closings_prevent_overlap on public.cash_closings;
create trigger cash_closings_prevent_overlap
  before insert on public.cash_closings
  for each row
  execute function public._prevent_overlapping_closing();

-- =============================================================================
-- DOWN (manual):
-- =============================================================================
-- drop trigger if exists cash_closings_prevent_overlap on public.cash_closings;
-- drop function if exists public._prevent_overlapping_closing();
-- alter table public.orders drop constraint if exists orders_payment_method_check;
-- alter table public.orders add constraint orders_payment_method_check check (payment_method in ('efectivo','transferencia'));
-- (recreate update_order/create_manual_order from 20260922000000)
