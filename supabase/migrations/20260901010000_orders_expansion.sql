-- NOT APPLIED YET. Reviewed by the orchestrator by hand before running against
-- remote (project vjgdtxryudoscumwsjhs) — do NOT `supabase db push` this from
-- an agent session. The orchestrator will additionally re-verify real
-- anonymous access (curl + anon apikey, no session) against
-- create_storefront_order before trusting this migration — see
-- 20260831160000_fix_anon_execute_grants.sql for why that step is
-- non-negotiable on anything anon-reachable in this project.
--
-- Builds on top of:
--   20260831140000_storefront.sql  (orders/order_items tables, order_status
--                                    enum, create_storefront_order, format_gs)
--   20260831160000_fix_anon_execute_grants.sql (has_branch_access/
--                                    is_branch_admin granted to anon)
--   20260901000000_remove_viewer_role.sql (only 'admin'/'barber' roles exist)
--
-- Verified real schema before writing this (read every migration file, no
-- assumptions): contacts has NO branch_id (global table) — columns
-- id, full_name, ci, phone, comment, created_at, ci nullable. orders already
-- has a `contact_id uuid references contacts(id)` column
-- (20260831140000_storefront.sql) that create_storefront_order never
-- populated — fixed here. order_status enum values:
-- pending/confirmed/completed/cancelled.
--
-- Adds:
--   orders.payment_method ('efectivo'|'transferencia', default 'efectivo')
--   orders.delivery_type ('pickup'|'delivery', default 'pickup')
--   orders.delivery_address (nullable text)
--   No backfill UPDATE needed: `alter table ... add column ... not null
--   default X` applies the default to every existing row as part of the same
--   DDL statement in Postgres (metadata-only fill since Postgres 11, no
--   table rewrite needed since the default is not volatile) — an explicit
--   UPDATE would be redundant.
--
--   public._price_order_items(uuid, jsonb): internal pricing helper shared by
--   create_storefront_order/create_manual_order/update_order, so all three
--   validate item shape + recalculate prices identically. NOT granted to
--   anon/authenticated directly — only reachable through the three
--   SECURITY DEFINER RPCs that call it internally as the same definer.
--
--   public._find_or_create_contact(text, text): shared find-or-create by
--   phone, used by all three RPCs so a customer is linked to the same
--   Contact regardless of how the order was created.
--
--   create_storefront_order: re-created with 3 new trailing parameters
--   (payment_method/delivery_type/delivery_address validation, contact
--   find-or-create — previously always left contact_id NULL, bug fixed here
--   — and extra WhatsApp message lines). The old 6-arg signature is
--   explicitly DROPPED first — `create or replace` does not replace a
--   function whose parameter type list changed, it would otherwise leave
--   the old 6-arg version alive and reachable by anon alongside this one
--   (orchestrator caught this while reviewing; the sub-agent's original
--   comment here assumed create-or-replace alone would handle it, which is
--   incorrect Postgres behavior).
--
--   create_manual_order: new RPC for staff-entered orders from /orders,
--   security definer, admin/barber-of-branch only, no storefront_enabled/
--   is_active gate (staff can log a manual order even with the public store
--   off), no rate limiting (not anonymous traffic). anon is NOT granted
--   execute — staff-only.
--
--   update_order: new RPC for full edit of an existing order (items,
--   customer, payment, delivery, status), security definer, admin/barber of
--   the order's branch only. Deletes+reinserts order_items with prices
--   recalculated server-side at edit time (never trusts a client total),
--   updates the linked contact if the phone changed. anon NOT granted
--   execute.
--
-- Rollback (manual, commented at the bottom).

-- ============================================================================
-- 1. orders: payment/delivery columns
-- ============================================================================

alter table public.orders
  add column payment_method text not null default 'efectivo'
    check (payment_method in ('efectivo', 'transferencia')),
  add column delivery_type text not null default 'pickup'
    check (delivery_type in ('pickup', 'delivery')),
  add column delivery_address text;

-- ============================================================================
-- 2. Shared internal helpers (not granted to anon/authenticated — only
--    reachable via the SECURITY DEFINER RPCs below, which run as the same
--    definer and can call them regardless of grants).
-- ============================================================================

create or replace function public._price_order_items(p_branch_id uuid, p_items jsonb)
returns table (
  service_id uuid,
  name text,
  unit_price integer,
  qty integer,
  line_total integer
)
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_item jsonb;
  v_item_count int;
  v_service record;
begin
  v_item_count := jsonb_array_length(p_items);
  if v_item_count is null or v_item_count < 1 or v_item_count > 20 then
    raise exception 'Pedido invalido' using errcode = 'VC400';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    if v_item->>'service_id' is null
       or coalesce((v_item->>'qty')::int, 0) < 1
       or coalesce((v_item->>'qty')::int, 0) > 20 then
      raise exception 'Pedido invalido' using errcode = 'VC400';
    end if;

    select s.id, s.name, s.price
      into v_service
      from public.services s
      where s.id = (v_item->>'service_id')::uuid
        and s.is_active
        and s.is_available
        and (s.branch_id = p_branch_id or s.branch_id is null)
      limit 1;

    if v_service.id is null then
      raise exception 'Uno de los servicios no esta disponible' using errcode = 'VC409';
    end if;

    service_id := v_service.id;
    name := v_service.name;
    unit_price := v_service.price;
    qty := (v_item->>'qty')::int;
    line_total := v_service.price * qty;
    return next;
  end loop;
end;
$$;

create or replace function public._find_or_create_contact(p_customer_name text, p_customer_phone text)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_contact_id uuid;
begin
  select id into v_contact_id
    from public.contacts
    where phone = p_customer_phone
    limit 1;

  if v_contact_id is null then
    insert into public.contacts (full_name, phone, ci)
    values (trim(p_customer_name), p_customer_phone, null)
    returning id into v_contact_id;
  end if;

  return v_contact_id;
end;
$$;

-- ============================================================================
-- 3. create_storefront_order — extended behavior
-- ============================================================================
-- CORRECTION to this migration's original assumption: `create or replace
-- function` only replaces a function when the parameter TYPE LIST matches
-- exactly. Adding 3 new parameters (even with defaults) changes that list,
-- so `create or replace` here would NOT replace the original 6-arg version —
-- it would create a second, overloaded function alongside it, leaving the
-- old 6-arg one (no contact linking, no payment/delivery) still live and
-- still granted to anon/authenticated from 20260831140000_storefront.sql.
-- Drop the old signature explicitly first so only the 9-arg version exists.
drop function if exists public.create_storefront_order(text, text, text, text, text, jsonb);

create or replace function public.create_storefront_order(
  p_slug text,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text default null,
  p_note text default null,
  p_items jsonb default '[]'::jsonb, -- [{"service_id":"...", "qty":2}, ...]
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
  -- 1. Branch must exist, be active, and have the storefront enabled.
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

  -- 2. Validate customer fields and item list shape.
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

  -- 3. Rate limiting against orders itself (no extra infra — see design).
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

  -- 4. Validate + price items server-side (shared helper — client-sent
  -- prices are ignored).
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

  -- 5. Find-or-create the Contact by phone and link it to the order.
  v_contact_id := public._find_or_create_contact(p_customer_name, p_customer_phone);

  -- 6. Insert order + items, build the WhatsApp message (single source of
  -- truth persisted on the row — see design "Mensaje de WhatsApp").
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

revoke all on function public.create_storefront_order(text, text, text, text, text, jsonb, text, text, text) from public;
grant execute on function public.create_storefront_order(text, text, text, text, text, jsonb, text, text, text) to anon, authenticated;

-- ============================================================================
-- 4. create_manual_order — staff-entered orders from /orders (no storefront
--    gate, no rate limiting, authenticated-only)
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
  -- 1. Authorization: caller must be admin/barber of this branch.
  if not exists (
    select 1 from public.user_branch_access
    where branch_id = p_branch_id
      and user_id = auth.uid()
      and role in ('admin', 'barber')
  ) then
    raise exception 'No autorizado' using errcode = 'VC403';
  end if;

  -- 2. Branch must simply exist (no storefront_enabled/is_active gate — a
  -- manual order is a staff action, not a public-store transaction).
  select id, name, whatsapp_number
    into v_branch
    from public.branches
    where id = p_branch_id
    limit 1;

  if v_branch.id is null then
    raise exception 'Sucursal no encontrada' using errcode = 'VC404';
  end if;

  -- 3. Validate customer fields and item list shape (same rules as storefront).
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

  -- 4. No rate limiting — not anonymous traffic.

  -- 5. Validate + price items server-side (shared helper).
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

  -- 6. Find-or-create the Contact by phone.
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

revoke all on function public.create_manual_order(uuid, text, text, text, text, jsonb, text, text, text) from public;
grant execute on function public.create_manual_order(uuid, text, text, text, text, jsonb, text, text, text) to authenticated;

-- ============================================================================
-- 5. update_order — full edit of an existing order (staff-only)
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
  p_items jsonb -- [{"service_id":"...", "qty":2}, ...]
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
  -- 1. Order must exist.
  select id, branch_id, contact_id, customer_phone
    into v_order
    from public.orders
    where id = p_order_id
    limit 1;

  if v_order.id is null then
    raise exception 'Pedido no encontrado' using errcode = 'VC404';
  end if;

  -- 2. Authorization: caller must be admin/barber of the order's branch.
  if not exists (
    select 1 from public.user_branch_access
    where branch_id = v_order.branch_id
      and user_id = auth.uid()
      and role in ('admin', 'barber')
  ) then
    raise exception 'No autorizado' using errcode = 'VC403';
  end if;

  -- 3. Validate fields.
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

  -- 4. Re-price items server-side (shared helper — never trust a client
  -- total, same principle as creation).
  for v_priced in select * from public._price_order_items(v_order.branch_id, p_items)
  loop
    v_total := v_total + v_priced.line_total;
  end loop;

  -- 5. Find-or-create the contact for the (possibly new) phone.
  v_contact_id := public._find_or_create_contact(p_customer_name, p_customer_phone);

  -- 6. Replace order_items with the freshly priced set.
  delete from public.order_items where order_id = p_order_id;

  for v_priced in select * from public._price_order_items(v_order.branch_id, p_items)
  loop
    insert into public.order_items (order_id, service_id, name_snapshot, unit_price, qty, line_total)
    values (p_order_id, v_priced.service_id, v_priced.name, v_priced.unit_price, v_priced.qty, v_priced.line_total);
  end loop;

  -- 7. Update the order row.
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

revoke all on function public.update_order(uuid, text, text, text, text, text, text, text, text, jsonb) from public;
grant execute on function public.update_order(uuid, text, text, text, text, text, text, text, text, jsonb) to authenticated;

-- ============================================================================
-- Rollback (manual):
-- ============================================================================
-- drop function if exists public.update_order(uuid, text, text, text, text, text, text, text, text, jsonb);
-- drop function if exists public.create_manual_order(uuid, text, text, text, text, jsonb, text, text, text);
-- drop function if exists public.create_storefront_order(text, text, text, text, text, jsonb, text, text, text);
-- -- recreate the pre-expansion 6-arg create_storefront_order from
-- -- 20260831140000_storefront.sql if rolling all the way back, then:
-- drop function if exists public._find_or_create_contact(text, text);
-- drop function if exists public._price_order_items(uuid, jsonb);
-- alter table public.orders drop column delivery_address, drop column delivery_type, drop column payment_method;
