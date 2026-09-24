-- Found via `supabase db advisors` (0028/0029 anon/authenticated
-- SECURITY DEFINER function executable): these 6 functions are internal
-- helpers/triggers, never meant to be called directly via
-- /rest/v1/rpc/<name> -- they should only run as a trigger, or be called
-- internally from another SECURITY DEFINER function (which checks
-- privileges against the DEFINER's own role, not the end caller's, so
-- revoking the caller-facing grant here does not break that internal path).
--
-- compute_branch_slug, fn_order_completed_to_movement,
-- prevent_last_admin_removal, recompute_all_branch_slugs all RETURN
-- trigger (confirmed via pg_proc) -- Postgres already refuses to invoke
-- these as a plain function call outside trigger context, so this closes a
-- meaningless-but-present RPC surface, not a working exploit.
--
-- _find_or_create_contact and _latest_closing_at are real callable
-- functions (return uuid / timestamptz) used internally by
-- create_storefront_order and the closing-overlap guard respectively --
-- verified via the local integration suite (tests/integration) after this
-- migration that both still work end-to-end.
--
-- has_branch_access/is_branch_admin/is_admin_anywhere are deliberately left
-- untouched: RLS policies call them in USING clauses, which are evaluated
-- under the querying session's own role, so anon/authenticated need direct
-- EXECUTE on those specifically or every RLS-protected query would error
-- instead of just being denied.
--
-- Idempotent: safe to run against production regardless of prior state.

-- These 5 (all but _latest_closing_at) were never explicitly revoked from
-- PUBLIC at creation time, so anon/authenticated inherit EXECUTE from the
-- ambient PUBLIC grant, not from an explicit per-role grant -- an explicit
-- `revoke ... from anon, authenticated` is a no-op against that (confirmed
-- live: verified via has_function_privilege that the first attempt at this
-- migration did not actually change anything). Revoking from PUBLIC itself
-- is what's needed; none of the 5 has an explicit authenticated-specific
-- grant to preserve, so this fully closes them.
revoke execute on function public._find_or_create_contact(uuid, text, text) from public;
revoke execute on function public._latest_closing_at(uuid) from anon;
revoke execute on function public.compute_branch_slug() from public;
revoke execute on function public.fn_order_completed_to_movement() from public;
revoke execute on function public.prevent_last_admin_removal() from public;
revoke execute on function public.recompute_all_branch_slugs() from public;
