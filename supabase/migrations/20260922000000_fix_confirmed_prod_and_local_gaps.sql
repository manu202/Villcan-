-- =============================================================================
-- fix_confirmed_prod_and_local_gaps
--
-- Fixes 6 confirmed authorization/RLS gaps (contacts branch isolation, item 2
-- of the audit, is already fixed locally in 20260910010000 — not touched here):
--
--   1. profiles_select_authenticated — branch-scoped profile visibility.
--   3. uba_insert — removes self-admin-escalation hole; bootstrap moves to
--      create_branch_with_admin() RPC.
--   4. branches_insert_authenticated — dropped; branch creation is now RPC-only.
--   5. update_order — fixes role in ('admin','barber') -> ('admin','user') and
--      adds a completed/cancelled state-machine guard (VC409).
--   6. orders_update_admin_or_user — adds WITH CHECK + a BEFORE UPDATE trigger
--      guarding total/delivery_fee against direct client tampering.
--   7. movements_update_admin_or_user — blocks edits to movements already
--      covered by a cash closing.
-- =============================================================================

-- =============================================================================
-- 1. profiles — branch-scoped SELECT
-- =============================================================================

drop policy if exists "profiles_select_all" on public.profiles;
drop policy if exists "profiles_select_authenticated" on public.profiles;

create policy "profiles_select_branch_scoped"
  on public.profiles
  for select
  to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1
      from public.user_branch_access uba_self
      join public.user_branch_access uba_other
        on uba_other.branch_id = uba_self.branch_id
      where uba_self.user_id = auth.uid()
        and uba_other.user_id = profiles.id
    )
  );

-- =============================================================================
-- 3 & 4. branches / user_branch_access — remove self-service admin escalation
--         and direct branch insert; move bootstrap into a SECURITY DEFINER RPC.
-- =============================================================================

drop policy if exists "branches_insert_authenticated" on public.branches;

drop policy if exists "uba_insert" on public.user_branch_access;

create policy "uba_insert_existing_admin"
  on public.user_branch_access
  for insert
  with check (public.is_branch_admin(branch_id));

-- create_branch_with_admin: atomically creates a branch and its first admin
-- user_branch_access row. Callable by any authenticated user (bootstrapping
-- one's own first branch is legitimate); bypasses the now-restrictive
-- branches/uba insert policies via SECURITY DEFINER.
create or replace function public.create_branch_with_admin(
  p_name text,
  p_address text default null,
  p_vertical public.business_vertical default 'generic',
  p_whatsapp text default null
)
returns public.branches
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_branch public.branches;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'No autorizado' using errcode = 'VC403';
  end if;

  if p_name is null or length(trim(p_name)) < 1 then
    raise exception 'Nombre invalido' using errcode = 'VC400';
  end if;

  insert into public.branches (name, address, vertical, whatsapp_number)
  values (trim(p_name), nullif(trim(coalesce(p_address, '')), ''), p_vertical, p_whatsapp)
  returning * into v_branch;

  insert into public.user_branch_access (user_id, branch_id, role)
  values (v_user_id, v_branch.id, 'admin');

  return v_branch;
end;
$$;

revoke all on function public.create_branch_with_admin(text, text, public.business_vertical, text) from public;
grant execute on function public.create_branch_with_admin(text, text, public.business_vertical, text) to authenticated;

-- =============================================================================
-- 6. orders — WITH CHECK + trigger guard against direct total/delivery_fee
--    tampering. update_order/create_manual_order set a session-local flag to
--    bypass the guard for their own internal updates.
-- =============================================================================

drop policy if exists "orders_update_admin_or_user" on public.orders;

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
  )
  with check (
    exists (
      select 1 from public.user_branch_access
      where branch_id = orders.branch_id
        and user_id = auth.uid()
        and role in ('admin', 'user')
    )
  );

create or replace function public._guard_order_financial_fields()
returns trigger
language plpgsql
as $$
begin
  if current_setting('app.bypass_order_guard', true) is distinct from 'on' then
    if new.total is distinct from old.total
       or new.delivery_fee is distinct from old.delivery_fee then
      raise exception 'No se puede modificar el total del pedido directamente' using errcode = 'VC409';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_guard_financial_fields on public.orders;
create trigger orders_guard_financial_fields
  before update on public.orders
  for each row
  execute function public._guard_order_financial_fields();

-- =============================================================================
-- 5. update_order — role check fix ('barber' -> 'user') + status guard (VC409)
--    Body preserved exactly from 20260911010000_fix_double_price_order_items.sql
--    aside from those two changes and the bypass-flag set before the internal
--    UPDATE (item 6).
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
  v_priced_items   jsonb := '[]'::jsonb;
  v_item           jsonb;
begin
  -- 1. El pedido debe existir.
  select id, branch_id, contact_id, customer_phone, delivery_fee, status
    into v_order
    from public.orders
    where id = p_order_id
    limit 1;

  if v_order.id is null then
    raise exception 'Pedido no encontrado' using errcode = 'VC404';
  end if;

  -- 1b. Guarda de estado: un pedido completado/cancelado no se puede editar.
  if v_order.status in ('completed', 'cancelled') then
    raise exception 'No se puede editar un pedido completado o cancelado' using errcode = 'VC409';
  end if;

  -- 2. Autorización: admin/user de la sucursal.
  if not exists (
    select 1 from public.user_branch_access
    where branch_id = v_order.branch_id
      and user_id = auth.uid()
      and role in ('admin', 'user')
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

  -- 4. Re-calcular items server-side. Acumulamos los datos calculados en
  --    v_priced_items para reutilizarlos en el INSERT (A4: una sola llamada).
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

  -- 5. Total final = items + delivery_fee (si aplica).
  v_existing_fee := coalesce(v_order.delivery_fee, 0);
  if p_delivery_type = 'delivery' then
    v_final_total := v_items_total + coalesce(p_delivery_fee, v_existing_fee);
  else
    v_final_total := v_items_total;
  end if;

  -- 6. Find-or-create contacto — por (branch_id, phone).
  v_contact_id := public._find_or_create_contact(v_order.branch_id, p_customer_name, p_customer_phone);

  -- 7. Reemplazar order_items con precios actualizados (A4: usa v_priced_items).
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

  -- 8. Actualizar el pedido (bypass del guard de campos financieros: item 6).
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

-- create_manual_order: also sets the bypass flag before its internal INSERT
-- so the new orders_guard_financial_fields trigger never blocks it (an INSERT
-- has no OLD row so the guard is a no-op there, but the flag is set for
-- consistency/documentation with update_order's contract).
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

  -- 6. Insertar pedido (bypass del guard de campos financieros: item 6; no-op
  --    en INSERT ya que el trigger solo actua en UPDATE, se documenta igual).
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

-- =============================================================================
-- 7. movements — block edits to movements already covered by a cash closing.
-- =============================================================================

-- _latest_closing_at: SECURITY DEFINER so the RLS policy below can see the
-- true latest closing timestamp for a branch regardless of the caller's own
-- cash_closings_select visibility (a non-admin, non-closer role='user' staff
-- member cannot SELECT most cash_closings rows directly — without this, a
-- correlated subquery inside the policy would silently see zero rows and
-- COALESCE to '-infinity', defeating the guard for exactly the population it
-- is meant to restrict — the same class of self-referencing-RLS bug as the
-- old uba_insert hole).
create or replace function public._latest_closing_at(p_branch_id uuid)
returns timestamptz
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select max(closed_at) from public.cash_closings where branch_id = p_branch_id;
$$;

revoke all on function public._latest_closing_at(uuid) from public;
grant execute on function public._latest_closing_at(uuid) to authenticated;

drop policy if exists "movements_update_admin_or_user" on public.movements;

create policy "movements_update_admin_or_user" on public.movements
  for update using (
    exists (
      select 1 from public.user_branch_access
      where branch_id = movements.branch_id
        and user_id = auth.uid()
        and role in ('admin', 'user')
    )
    and movements.created_at > coalesce(
      public._latest_closing_at(movements.branch_id),
      '-infinity'::timestamptz
    )
  );

-- =============================================================================
-- DOWN (manual):
-- =============================================================================
-- drop trigger if exists orders_guard_financial_fields on public.orders;
-- drop function if exists public._guard_order_financial_fields();
-- drop function if exists public.create_branch_with_admin(text, text, public.business_vertical, text);
-- (recreate previous policies/functions from the migrations referenced above)
