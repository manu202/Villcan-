-- NOT APPLIED YET. Reviewed by the orchestrator by hand before running against
-- remote (project vjgdtxryudoscumwsjhs) — do NOT `supabase db push` this from
-- an agent session. See sdd/store-business-config/{spec,design} (Engram,
-- project villcan).
--
-- Builds on top of the real production state as of:
--   20260831120000_baseline.sql   (schema snapshot, already applied)
--   20260831120001_user_fixes.sql (profiles.role dropped, citext email,
--                                   RLS via has_branch_access/is_branch_admin,
--                                   last-admin-removal trigger)
--   20260831120002_verticals.sql  (branches.vertical, business_settings.staff_label)
--   20260831130000_fix_movements_policies.sql (real movements policy names)
--   20260831140000_storefront.sql (branches.slug/whatsapp_number/storefront_enabled,
--                                   services catalog metadata, orders/order_items,
--                                   create_storefront_order RPC, public RLS policies)
--
-- Redesign: the owner no longer types a slug or flips a manual "storefront
-- enabled" toggle per branch (that UI is reverted in
-- src/app/(app)/settings/branches/page.tsx back to name+address only — see
-- sdd/store-business-config/design "UI"). Instead:
--   - business_settings.business_name: new global singleton field (owner
--     types this once, in the new /settings/store page).
--   - branches.slug is now DERIVED: slugify(business_name) + '-' +
--     slugify(branch.name), collision-resolved with a numeric suffix
--     (slug has a UNIQUE constraint from 20260831140000 — collisions are
--     expected once two branches produce the same base slug).
--   - branches.storefront_enabled is now DERIVED: true iff
--     whatsapp_number is non-null/non-blank. No manual toggle anymore.
--
-- Adds:
--   business_settings.business_name (text, default '').
--   public.slugify(text) — ASCII-only slug helper. Accents/ñ are stripped
--     via the `unaccent` extension (installed into the `extensions` schema,
--     same convention as pgcrypto in 20260831140000) rather than a
--     hand-rolled translate() table — unaccent is a standard, well-tested
--     Postgres contrib module available on Supabase, and covers the full
--     Spanish/Guarani-adjacent accent set (á é í ó ú ü ñ, and uppercase)
--     without us having to maintain a translation table ourselves.
--   public.compute_branch_slug() — BEFORE INSERT OR UPDATE OF
--     whatsapp_number, name trigger function on branches. Recomputes slug
--     (with collision suffixing) and storefront_enabled on every relevant
--     write, so the derived values self-correct no matter where the row is
--     edited from (this migration's backfill, the /settings/store page, a
--     future admin tool, etc.) — the alternative (deriving in the client)
--     would silently drift the moment a second write path exists.
--   public.recompute_all_branch_slugs() — AFTER UPDATE OF business_name
--     trigger function on business_settings. Re-fires the branches trigger
--     for every row via `update branches set name = name` (a column
--     assignment to itself still matches `UPDATE OF name` per Postgres
--     trigger semantics) instead of duplicating the slugify/collision logic
--     here — single source of truth stays in compute_branch_slug().
--
-- SECURITY DEFINER, deliberately: both trigger functions run as the table
-- owner (postgres, via SECURITY DEFINER), NOT as the invoking user. Reason:
-- collision detection and the business-name-changed recompute both need to
-- see/update EVERY branch, but branches_select/branches_update_admin are
-- has_branch_access(id)/is_branch_admin(id) — scoped per branch. An admin
-- who only manages Branch A (not B) would, as invoker, have the recompute's
-- `update branches set name = name` silently skip Branch B under RLS (no
-- error — UPDATE just matches 0 rows for the branches it can't write), and
-- the collision SELECT in compute_branch_slug would be blind to slugs
-- already used by branches the caller can't see, producing a bogus
-- "unique" slug that duplicates one on a branch out of view. Both are the
-- same class of RLS-visibility bug already flagged and fixed for
-- create_storefront_order in 20260831140000 — same fix here.
--
-- Backfill: touch every existing branch's `name` (a no-op assignment) so
-- the new trigger computes real slugs/storefront_enabled for whatever rows
-- already exist, using whatever business_name is present at deploy time
-- (empty string if the owner hasn't filled it in yet via /settings/store —
-- slugify('') is '', so the slug degrades gracefully to just the branch
-- name's slug, see compute_branch_slug's v_base branches below).
--
-- Rollback (manual, commented at the bottom).

-- ============================================================================
-- 1. business_settings.business_name (global, singleton — same shape as
--    services_label/staff_label)
-- ============================================================================

alter table public.business_settings
  add column business_name text not null default '';

-- ============================================================================
-- 2. unaccent extension (installed in `extensions`, like pgcrypto in
--    20260831140000 — Supabase keeps contrib extensions out of `public`)
-- ============================================================================

create extension if not exists unaccent with schema extensions;

-- ============================================================================
-- 3. slugify(text) — ASCII slug helper
-- ============================================================================
-- search_path pinned to pg_catalog, pg_temp: every non-built-in call inside
-- is schema-qualified (extensions.unaccent), so nothing here should ever
-- resolve through a mutable/hijackable search_path.
create or replace function public.slugify(input text)
returns text
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select trim(
    both '-' from
    regexp_replace(
      lower(extensions.unaccent(coalesce(input, ''))),
      '[^a-z0-9]+', '-', 'g'
    )
  );
$$;

-- ============================================================================
-- 4. compute_branch_slug() — derives slug + storefront_enabled per branch
-- ============================================================================

create or replace function public.compute_branch_slug()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_business_name text;
  v_business_slug text;
  v_branch_slug text;
  v_base text;
  v_candidate text;
  v_suffix int := 1;
begin
  select business_name into v_business_name
    from public.business_settings
    where id = 1;

  v_business_slug := public.slugify(v_business_name);
  v_branch_slug := public.slugify(new.name);

  if v_business_slug = '' and v_branch_slug = '' then
    -- Degenerate case (no business_name yet AND an all-symbols branch name,
    -- e.g. before the owner has filled in anything): fall back to a fixed
    -- token so slug is never empty ("" is not usable as a URL segment and
    -- would collide with itself across every branch in this state).
    v_base := 'sucursal';
  elsif v_business_slug = '' then
    v_base := v_branch_slug;
  elsif v_branch_slug = '' then
    v_base := v_business_slug;
  else
    v_base := v_business_slug || '-' || v_branch_slug;
  end if;

  -- Collision handling: slug is UNIQUE (20260831140000). Walk -2, -3, ...
  -- until free. `id is distinct from new.id` excludes this row itself so
  -- re-saving an unrelated field (or the business-name-changed recompute
  -- below) doesn't perpetually bump its own suffix.
  v_candidate := v_base;
  while exists (
    select 1 from public.branches
    where slug = v_candidate
      and id is distinct from new.id
  ) loop
    v_suffix := v_suffix + 1;
    v_candidate := v_base || '-' || v_suffix;
  end loop;

  new.slug := v_candidate;
  new.storefront_enabled := (new.whatsapp_number is not null and btrim(new.whatsapp_number) <> '');

  return new;
end;
$$;

drop trigger if exists branches_compute_slug on public.branches;
create trigger branches_compute_slug
  before insert or update of whatsapp_number, name on public.branches
  for each row
  execute function public.compute_branch_slug();

-- ============================================================================
-- 5. recompute_all_branch_slugs() — re-derives every branch's slug when the
--    global business_name changes
-- ============================================================================

create or replace function public.recompute_all_branch_slugs()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Self-assignment still satisfies `UPDATE OF name` per Postgres trigger
  -- semantics (fires whenever the column appears in the SET list,
  -- regardless of whether the value actually changes) — this re-runs
  -- compute_branch_slug() for every branch without duplicating its logic.
  update public.branches set name = name;
  return null; -- ignored: AFTER trigger return value has no effect
end;
$$;

drop trigger if exists business_settings_recompute_slugs on public.business_settings;
create trigger business_settings_recompute_slugs
  after update of business_name on public.business_settings
  for each row
  execute function public.recompute_all_branch_slugs();

-- ============================================================================
-- 6. Backfill existing branches so slug/storefront_enabled reflect whatever
--    business_name/whatsapp_number already exist at deploy time.
-- ============================================================================

update public.branches set name = name;

-- ============================================================================
-- Rollback (manual):
-- ============================================================================
-- drop trigger if exists business_settings_recompute_slugs on public.business_settings;
-- drop trigger if exists branches_compute_slug on public.branches;
-- drop function if exists public.recompute_all_branch_slugs();
-- drop function if exists public.compute_branch_slug();
-- drop function if exists public.slugify(text);
-- alter table public.business_settings drop column business_name;
-- -- (leaves the `unaccent` extension installed; harmless to keep)
