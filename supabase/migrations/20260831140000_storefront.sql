-- NOT APPLIED YET. Reviewed by the orchestrator by hand before running against
-- remote (project vjgdtxryudoscumwsjhs) — do NOT `supabase db push` this from
-- an agent session. See sdd/storefront-whatsapp-orders/{spec,design} (Engram,
-- project villcan).
--
-- Builds on top of the real production state as of:
--   20260831120000_baseline.sql   (schema snapshot, already applied)
--   20260831120001_user_fixes.sql (profiles.role dropped, citext email,
--                                   RLS via has_branch_access/is_branch_admin,
--                                   last-admin-removal trigger)
--   20260831120002_verticals.sql  (branches.vertical, business_settings.staff_label)
--   20260831130000_fix_movements_policies.sql (real movements policy names:
--                                   movements_select_branch_access,
--                                   movements_write_admin_or_barber,
--                                   movements_update_admin_or_barber)
-- Real `services` policies currently in prod (from 20260831120001, untouched
-- since): services_select_branch_access, services_write_admin_or_barber,
-- services_update_admin_or_barber, plus the never-touched baseline
-- services_admin_delete. None of these are dropped here — services_public_select
-- below is ADDITIVE (RLS policies combine permissively with OR), scoped to
-- `anon` only, so authenticated behavior for staff is unchanged.
--
-- Adds:
--   branches.slug / whatsapp_number / storefront_enabled (feature ships OFF —
--     storefront_enabled defaults false, a kill switch with no code revert).
--   services.description / image_url / category / is_available (catalog
--     metadata; is_available defaults true so existing rows are unaffected).
--   orders / order_items tables + order_status enum.
--   services_public_select: anon SELECT limited to active+available services
--     of branches with storefront_enabled = true.
--   branches_public_select_storefront: anon SELECT on branches, scoped to
--     storefront_enabled+is_active. NOT in the original design — added because
--     without it anon can't read branches at all (existing branches_select
--     policy is has_branch_access-only), which would silently break both the
--     storefront page's own branch lookup AND services_public_select's
--     subquery against branches. See inline comment at the policy below.
--   orders/order_items: RLS enabled, NO policy for anon at all — every public
--     write goes through create_storefront_order (SECURITY DEFINER). Staff
--     (authenticated) get SELECT via has_branch_access and UPDATE restricted
--     to admin/barber, mirroring the movements/services pattern above.
--   format_gs(int): thousands-separator formatter for the WhatsApp message
--     (`to_char` + `lc_numeric` is locale-fragile — see design).
--   create_storefront_order(...): SECURITY DEFINER RPC. Validates slug/branch
--     (VC404), customer+items (VC400), rate-limits against orders itself
--     (VC429), validates items belong to the branch (VC409), recalculates
--     unit_price/total server-side (client-sent prices are never trusted),
--     inserts orders+order_items, returns the WhatsApp message text.
--
-- Rollback (manual, commented at the bottom).

-- gen_random_bytes (usado para el order_code) requiere pgcrypto -- a diferencia
-- de gen_random_uuid, que es nativa desde Postgres 13. Supabase instala sus
-- extensiones en el schema "extensions" (visto en extensions.uuid_generate_v4()
-- del baseline), no en "public" -- por eso se fuerza el schema explicito aca
-- y se llama extensions.gen_random_bytes(...) mas abajo: la funcion usa
-- search_path = public, pg_temp a proposito (evita search_path hijacking),
-- asi que sin esto no encontraria gen_random_bytes si ya vivia en extensions.
create extension if not exists pgcrypto with schema extensions;

-- ============================================================================
-- 1. branches: storefront identity + kill switch
-- ============================================================================

alter table public.branches
  add column slug citext unique,
  add column whatsapp_number text,
  add column storefront_enabled boolean not null default false;

-- ============================================================================
-- 2. services: catalog presentation metadata
-- ============================================================================

alter table public.services
  add column description text,
  add column image_url text,
  add column category text,
  add column is_available boolean not null default true;

-- ============================================================================
-- 3. orders / order_items
-- ============================================================================

create type public.order_status as enum ('pending', 'confirmed', 'completed', 'cancelled');

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  order_code text not null,
  customer_name text not null,
  customer_phone text not null,
  customer_email text,
  contact_id uuid references public.contacts(id),
  note text,
  status public.order_status not null default 'pending',
  total integer not null check (total >= 0),
  whatsapp_message text not null,
  created_at timestamptz not null default now(),
  unique (branch_id, order_code)
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  service_id uuid not null references public.services(id),
  name_snapshot text not null,
  unit_price integer not null,
  qty smallint not null check (qty between 1 and 20),
  line_total integer not null
);

create index orders_branch_created_at_idx on public.orders (branch_id, created_at desc);
create index order_items_order_id_idx on public.order_items (order_id);

-- ============================================================================
-- 4. RLS
-- ============================================================================

-- 4a-pre. branches: additive anon read, storefront-scoped only.
-- IMPORTANT (deviation from design.md, flagged for review): the existing
-- "branches_select" policy is `USING (has_branch_access(id))` with no `TO`
-- clause, so it applies to every role including anon — and has_branch_access
-- always returns false for anon (auth.uid() is null). Without this policy,
-- anon has ZERO visibility into branches at all, which breaks two things the
-- design assumed would just work: (1) the storefront page itself resolving a
-- branch by slug, and (2) services_public_select's own subquery
-- `branch_id in (select id from branches where storefront_enabled)` — that
-- subquery runs as anon too and would silently return empty rows, making the
-- "public catalog" policy below true for NO service, ever. This policy is
-- additive (RLS combines permissively via OR) and scoped strictly to
-- storefront_enabled+is_active branches, so authenticated behavior on
-- branches_select is completely unchanged.
create policy "branches_public_select_storefront" on public.branches
  for select
  to anon
  using (storefront_enabled and is_active);

-- 4a. services: additive anon read for the public catalog. Combines with the
-- existing services_select_branch_access via OR — does not touch or narrow
-- what authenticated staff can already see.
create policy "services_public_select" on public.services
  for select
  to anon
  using (
    is_active
    and is_available
    and branch_id in (select id from public.branches where storefront_enabled)
  );

-- 4b. orders / order_items: enable RLS, grant NOTHING to anon. All public
-- writes go through create_storefront_order (SECURITY DEFINER, below) — a
-- direct anon INSERT is rejected because no policy exists for that role.
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

create policy "orders_select_branch_access" on public.orders
  for select
  to authenticated
  using (public.has_branch_access(branch_id));

create policy "orders_update_admin_or_barber" on public.orders
  for update
  to authenticated
  using (
    exists (
      select 1 from public.user_branch_access
      where branch_id = orders.branch_id
        and user_id = auth.uid()
        and role in ('admin', 'barber')
    )
  );

create policy "order_items_select_branch_access" on public.order_items
  for select
  to authenticated
  using (
    exists (
      select 1 from public.orders
      where orders.id = order_items.order_id
        and public.has_branch_access(orders.branch_id)
    )
  );

-- ============================================================================
-- 5. format_gs(int) — thousands-separator formatter for WhatsApp message
-- ============================================================================

create or replace function public.format_gs(amount integer)
returns text
language sql
immutable
as $$
  select trim(to_char(amount, 'FM999G999G999G999'), 'FM')::text;
$$;

-- ============================================================================
-- 6. create_storefront_order — SECURITY DEFINER RPC
-- ============================================================================

create or replace function public.create_storefront_order(
  p_slug text,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text default null,
  p_note text default null,
  p_items jsonb default '[]'::jsonb -- [{"service_id":"...", "qty":2}, ...]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_branch record;
  v_item jsonb;
  v_item_count int;
  v_order_id uuid;
  v_order_code text;
  v_total integer := 0;
  v_message text;
  v_items_out jsonb := '[]'::jsonb;
  v_line jsonb;
  v_service record;
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
  end loop;

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

  -- 4. Validate + price items server-side. Client-sent prices are ignored.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select id, name, price
      into v_service
      from public.services
      where id = (v_item->>'service_id')::uuid
        and is_active
        and is_available
        and (branch_id = v_branch.id or branch_id is null)
      limit 1;

    if v_service.id is null then
      raise exception 'Uno de los servicios no esta disponible' using errcode = 'VC409';
    end if;

    v_line := jsonb_build_object(
      'name', v_service.name,
      'qty', (v_item->>'qty')::int,
      'unit_price', v_service.price,
      'line_total', v_service.price * (v_item->>'qty')::int
    );
    v_items_out := v_items_out || jsonb_build_array(v_line);
    v_total := v_total + v_service.price * (v_item->>'qty')::int;
  end loop;

  -- 5. Insert order + items, build the WhatsApp message (single source of
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

  v_message := v_message || E'\n' || '*Total: Gs. ' || public.format_gs(v_total) || '*';

  insert into public.orders (
    branch_id, order_code, customer_name, customer_phone, customer_email,
    note, status, total, whatsapp_message
  ) values (
    v_branch.id, v_order_code, trim(p_customer_name), p_customer_phone, p_customer_email,
    p_note, 'pending', v_total, v_message
  )
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select id, name, price
      into v_service
      from public.services
      where id = (v_item->>'service_id')::uuid
      limit 1;

    insert into public.order_items (order_id, service_id, name_snapshot, unit_price, qty, line_total)
    values (
      v_order_id, v_service.id, v_service.name, v_service.price,
      (v_item->>'qty')::int, v_service.price * (v_item->>'qty')::int
    );
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

revoke all on function public.create_storefront_order(text, text, text, text, text, jsonb) from public;
grant execute on function public.create_storefront_order(text, text, text, text, text, jsonb) to anon, authenticated;

-- ============================================================================
-- Rollback (manual):
-- ============================================================================
-- drop function if exists public.create_storefront_order(text, text, text, text, text, jsonb);
-- drop function if exists public.format_gs(integer);
-- drop policy if exists "order_items_select_branch_access" on public.order_items;
-- drop policy if exists "orders_update_admin_or_barber" on public.orders;
-- drop policy if exists "orders_select_branch_access" on public.orders;
-- drop policy if exists "services_public_select" on public.services;
-- drop policy if exists "branches_public_select_storefront" on public.branches;
-- drop table if exists public.order_items;
-- drop table if exists public.orders;
-- drop type if exists public.order_status;
-- alter table public.services drop column is_available, drop column category, drop column image_url, drop column description;
-- alter table public.branches drop column storefront_enabled, drop column whatsapp_number, drop column slug;
