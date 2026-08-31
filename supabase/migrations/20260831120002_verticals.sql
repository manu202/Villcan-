-- REQUIERE: aplicar sobre el baseline real (pendiente de supabase db pull) antes
-- de correr esta migracion. NO fue aplicada contra el remoto todavia.
-- Ver: sdd/generalize-verticals/design (Engram, project villcan).
--
-- Adds:
--   business_vertical enum (barbershop|gastronomy|generic) + branches.vertical
--     (structural: the storefront branches its layout on this per branch).
--   business_settings.staff_label (cosmetic: same precedent as services_label,
--     global rather than per-branch — see design doc "Decisiones" table).
--
-- Backfill: el negocio existente ES una barberia, asi que queda barbershop/'Barbero'
-- -> cero cambio visible para el usuario actual.
--
-- Rollback (manual, comentado abajo).

-- ============================================================================
-- 1. business_vertical enum + branches.vertical
-- ============================================================================

create type public.business_vertical as enum ('barbershop', 'gastronomy', 'generic');

alter table public.branches
  add column vertical public.business_vertical not null default 'generic';

-- ============================================================================
-- 2. business_settings.staff_label
-- ============================================================================

alter table public.business_settings
  add column staff_label text not null default 'Personal';

-- ============================================================================
-- 3. Backfill existing rows (el negocio actual es una barberia)
-- ============================================================================

update public.branches set vertical = 'barbershop';
update public.business_settings set staff_label = 'Barbero';

-- ============================================================================
-- Rollback (manual):
-- ============================================================================
-- alter table public.business_settings drop column staff_label;
-- alter table public.branches drop column vertical;
-- drop type public.business_vertical;
