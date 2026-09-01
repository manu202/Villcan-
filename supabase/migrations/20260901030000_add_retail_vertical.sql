-- NOT APPLIED YET. Reviewed by the orchestrator by hand before running against
-- remote (project vjgdtxryudoscumwsjhs) — do NOT `supabase db push` this from
-- an agent session.
--
-- Adds 'retail' (venta de productos) as a third real vertical alongside
-- 'barbershop' and 'gastronomy' — the owner wants three visually distinct
-- storefront templates (gastronomy/menu, retail/product-grid,
-- services/booking-style), and 'generic' was never meant to carry its own
-- visual identity, just a fallback. 'generic' stays as-is (falls back to the
-- services-style template).
--
-- ALTER TYPE ... ADD VALUE cannot run in the same transaction as a statement
-- that uses the new value (Postgres restriction) — this migration ONLY adds
-- the enum value, nothing else touches it here.

alter type public.business_vertical add value if not exists 'retail';

-- Rollback: Postgres cannot drop a single enum value in place. Rolling back
-- would require recreating the type without 'retail' and migrating any rows
-- using it back to 'generic' first — not scripted here since it's a
-- destructive, multi-step operation; do it manually if ever needed.
