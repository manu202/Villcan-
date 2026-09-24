-- Found via `supabase db advisors` (0011_function_search_path_mutable):
-- these 4 functions have no fixed search_path, so name resolution inside
-- them depends on whatever search_path the calling session happens to have.
-- All 4 are SECURITY INVOKER (confirmed via pg_proc.prosecdef), so this
-- isn't the more severe SECURITY DEFINER schema-hijacking case -- but a
-- pinned search_path is still the correct, idiomatic default per the
-- Supabase Postgres best-practices skill, and every newer function in this
-- schema already does it (see confirm_order_delivery_fee, update_order).
--
-- ALTER FUNCTION ... SET only touches the function's config, not its body --
-- idempotent, safe to run against production regardless of prior state.

alter function public.format_gs(integer) set search_path = public, pg_temp;
alter function public._guard_order_financial_fields() set search_path = public, pg_temp;
alter function public._safe_branch_uuid(text) set search_path = public, pg_temp;
alter function public._prevent_overlapping_closing() set search_path = public, pg_temp;
