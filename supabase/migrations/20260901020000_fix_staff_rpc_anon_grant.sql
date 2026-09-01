-- Applied directly by the orchestrator after live verification (curl + anon
-- apikey, no session) showed anon could still invoke create_manual_order and
-- update_order despite 20260901010000_orders_expansion.sql doing
-- `revoke all ... from public; grant execute ... to authenticated;` for
-- both. The call reached the function body (got back a clean VC403 from the
-- function's own `raise exception`, not a Postgres 42501 permission-denied),
-- proving anon still had EXECUTE somehow.
--
-- Not a live exploit — both functions independently check
-- `user_id = auth.uid()` inside a `not exists (...)`, which is never true for
-- anon (auth.uid() is null there), so an anon caller always gets rejected
-- with VC403 regardless of grant status. But a staff-only RPC should not be
-- callable by anon at all — defense in depth, and to avoid relying solely on
-- the internal check for every future staff-only RPC in this project.
--
-- Explicit per-role revoke, since `revoke ... from public` did not remove it
-- (root cause not fully diagnosed — moving on pragmatically and verifying
-- the fix directly rather than spending more time on why).

revoke execute on function public.create_manual_order(uuid, text, text, text, text, jsonb, text, text, text) from anon;
revoke execute on function public.update_order(uuid, text, text, text, text, text, text, text, text, jsonb) from anon;

-- Rollback (manual):
--   grant execute on function public.create_manual_order(uuid, text, text, text, text, jsonb, text, text, text) to anon;
--   grant execute on function public.update_order(uuid, text, text, text, text, text, text, text, text, jsonb) to anon;
