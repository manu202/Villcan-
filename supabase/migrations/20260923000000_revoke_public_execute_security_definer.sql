-- Defense-in-depth: revoke the implicit PUBLIC EXECUTE grant that Postgres
-- adds to every new function by default. Both of these are SECURITY DEFINER
-- (they run with the creator's, effectively superuser-level, privileges) and
-- already check auth.uid() IS NULL and reject internally, so this was never
-- exploitable -- but relying on an internal check instead of the grant system
-- itself is exactly the trap the Supabase security skill calls out.
--
-- `authenticated` keeps working: both functions already have an explicit
-- `grant execute ... to authenticated` elsewhere (20260910000000/20260922050000
-- for update_order, 20260922000000 for create_branch_with_admin), which is a
-- separate grant from PUBLIC and is untouched by this revoke.
--
-- Idempotent: safe to run against production regardless of prior state.

revoke execute on function public.update_order(
  uuid, text, text, text, text, text, text, text, text, jsonb, integer
) from public;

revoke execute on function public.create_branch_with_admin(
  text, text, public.business_vertical, text
) from public;

-- Found via `supabase db advisors` (0028_anon_security_definer_function_executable):
-- complete_order_payment's own migration (20260922020000) did
-- `revoke all ... from public` + `grant ... to authenticated`, assuming that
-- was enough -- but Supabase grants EXECUTE to `anon` directly (not just via
-- PUBLIC) on new functions by default, and that anon grant was never
-- explicitly revoked. Confirmed live: anon could call this RPC. Not
-- exploitable (the function's own `user_id = auth.uid()` check rejects a
-- null/anon caller with VC403), but a staff-only payment-completion RPC
-- should never be reachable by an unauthenticated caller in the first place.
revoke execute on function public.complete_order_payment(uuid, integer) from anon;
