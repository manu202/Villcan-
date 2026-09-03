-- Renames the 'barber' role value to 'user' across all tables, constraints,
-- defaults, RLS policies, and RPCs. The role concept is application-generic;
-- 'barber' was a barbershop-specific name that leaked into the data model.
--
-- After this migration, valid roles are: 'admin' | 'user'

-- CORRECTION (orchestrator, before applying): this migration as originally
-- written assumed `profiles.role` still exists and tried to update/constrain
-- it, and redefined handle_new_user() to insert a `role` column into
-- profiles. Both are wrong — profiles.role was already dropped entirely in
-- 20260831120001_user_fixes.sql (bug #4: it was dead code, the real
-- authorization source of truth is user_branch_access.role only). Applying
-- the original would have failed outright ("column role does not exist")
-- and, had it been written to succeed some other way, would have
-- reintroduced the exact bug #4 already fixed. Removed the profiles.role
-- data migration, its constraint section entirely, and the `role` column
-- from the handle_new_user() insert — everything else (user_branch_access
-- rename, RLS policies, RPCs) is unchanged from the original.

-- ============================================================================
-- 1. Data migration — user_branch_access only (profiles has no role column)
-- ============================================================================

update public.user_branch_access
  set role = 'user'
  where role = 'barber';

-- ============================================================================
-- 2. Constraints and defaults — user_branch_access
-- ============================================================================

alter table public.user_branch_access
  drop constraint if exists user_branch_access_role_check;

alter table public.user_branch_access
  alter column role set default 'user';

alter table public.user_branch_access
  add constraint user_branch_access_role_check
  check (role = any (array['admin'::text, 'user'::text]));

-- ============================================================================
-- 5. RLS policies — movements
-- ============================================================================

drop policy if exists "movements_write_admin_or_barber" on public.movements;
drop policy if exists "movements_update_admin_or_barber" on public.movements;

create policy "movements_write_admin_or_user" on public.movements
  for insert with check (
    exists (
      select 1 from public.user_branch_access
      where branch_id = movements.branch_id
        and user_id = auth.uid()
        and role in ('admin', 'user')
    )
  );

create policy "movements_update_admin_or_user" on public.movements
  for update using (
    exists (
      select 1 from public.user_branch_access
      where branch_id = movements.branch_id
        and user_id = auth.uid()
        and role in ('admin', 'user')
    )
  );

-- ============================================================================
-- 6. RLS policies — services
-- ============================================================================

drop policy if exists "services_write_admin_or_barber" on public.services;
drop policy if exists "services_update_admin_or_barber" on public.services;

create policy "services_write_admin_or_user" on public.services
  for insert with check (
    branch_id is null
    or exists (
      select 1 from public.user_branch_access
      where branch_id = services.branch_id
        and user_id = auth.uid()
        and role in ('admin', 'user')
    )
  );

create policy "services_update_admin_or_user" on public.services
  for update using (
    branch_id is null
    or exists (
      select 1 from public.user_branch_access
      where branch_id = services.branch_id
        and user_id = auth.uid()
        and role in ('admin', 'user')
    )
  );

-- ============================================================================
-- 7. RLS policies — orders
-- ============================================================================

drop policy if exists "orders_update_admin_or_barber" on public.orders;

create policy "orders_update_admin_or_user" on public.orders
  for update
  to authenticated
  using (
    exists (
      select 1 from public.user_branch_access
      where branch_id = orders.branch_id
        and user_id = auth.uid()
        and role in ('admin', 'user')
    )
  );

-- ============================================================================
-- 8. RPC — create_manual_order: update authorization check
-- ============================================================================

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

  v_contact_id := public._find_or_create_contact(p_customer_name, p_customer_phone);

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

-- ============================================================================
-- 9. RPC — update_order: update authorization check
-- ============================================================================

create or replace function public.update_order(
  p_order_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_note text,
  p_payment_method text,
  p_delivery_type text,
  p_delivery_address text,
  p_status text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order record;
  v_total integer := 0;
  v_contact_id uuid;
  v_priced record;
begin
  select id, branch_id, contact_id, customer_phone
    into v_order
    from public.orders
    where id = p_order_id
    limit 1;

  if v_order.id is null then
    raise exception 'Pedido no encontrado' using errcode = 'VC404';
  end if;

  -- Authorization: caller must be admin/user of the order's branch.
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

  if p_payment_method not in ('efectivo', 'transferencia') then
    raise exception 'Metodo de pago invalido' using errcode = 'VC400';
  end if;

  if p_delivery_type not in ('pickup', 'delivery') then
    raise exception 'Tipo de entrega invalido' using errcode = 'VC400';
  end if;

  if p_delivery_type = 'delivery' and (p_delivery_address is null or length(trim(p_delivery_address)) = 0) then
    raise exception 'Direccion requerida para delivery' using errcode = 'VC400';
  end if;

  if p_status not in ('pending', 'confirmed', 'completed', 'cancelled') then
    raise exception 'Estado invalido' using errcode = 'VC400';
  end if;

  for v_priced in select * from public._price_order_items(v_order.branch_id, p_items)
  loop
    v_total := v_total + v_priced.line_total;
  end loop;

  v_contact_id := public._find_or_create_contact(p_customer_name, p_customer_phone);

  delete from public.order_items where order_id = p_order_id;

  for v_priced in select * from public._price_order_items(v_order.branch_id, p_items)
  loop
    insert into public.order_items (order_id, service_id, name_snapshot, unit_price, qty, line_total)
    values (p_order_id, v_priced.service_id, v_priced.name, v_priced.unit_price, v_priced.qty, v_priced.line_total);
  end loop;

  update public.orders
    set customer_name = trim(p_customer_name),
        customer_phone = p_customer_phone,
        customer_email = p_customer_email,
        contact_id = v_contact_id,
        note = p_note,
        payment_method = p_payment_method,
        delivery_type = p_delivery_type,
        delivery_address = nullif(trim(coalesce(p_delivery_address, '')), ''),
        status = p_status::public.order_status,
        total = v_total
    where id = p_order_id;

  return jsonb_build_object(
    'order_id', p_order_id,
    'total', v_total
  );
end;
$$;

-- Rollback (manual):
-- update public.user_branch_access set role = 'barber' where role = 'user';
-- alter table public.user_branch_access drop constraint if exists user_branch_access_role_check;
-- alter table public.user_branch_access alter column role set default 'barber';
-- alter table public.user_branch_access add constraint user_branch_access_role_check
--   check (role = any (array['admin'::text, 'barber'::text]));
-- (recreate policies/RPCs with 'barber')
