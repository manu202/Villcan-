-- =============================================================================
-- freeze_completed_orders_and_grant_cleanup
--
-- Closes the remaining gap from the audit's M-2 finding: update_order()
-- already refuses to touch a completed/cancelled order, but
-- orders/[id]/page.tsx does a raw `.update({status})` for non-'completed'
-- target statuses (see handleStatusChange), which goes straight through RLS
-- and bypasses update_order's own status guard entirely. That path could
-- still flip a completed order to cancelled (or reopen it), leaving the
-- movement created by fn_order_completed_to_movement stale forever, since
-- that trigger only fires on entry to 'completed', never on exit.
--
-- Fix: enforce the freeze at the database level, in the same trigger that
-- already guards total/delivery_fee, so it applies no matter which code
-- path performs the UPDATE (RPC or direct client call). This is a stricter,
-- unconditional check — there is no bypass flag for it, because no RPC in
-- this codebase has a legitimate reason to change a completed/cancelled
-- order's status yet (O-8 in the audit: no dedicated refund/cancel-after-
-- complete flow exists). If one is built later, it must go through a new
-- SECURITY DEFINER RPC that explicitly reverses the linked movement too,
-- not silently reopen this guard.
--
-- Also revokes two stray `anon` EXECUTE grants left over from earlier
-- migrations (update_order, create_branch_with_admin) — not exploitable,
-- since both functions reject a null auth.uid() internally, but there is
-- no reason for anon to hold the grant at all.
-- =============================================================================

create or replace function public._guard_order_financial_fields()
returns trigger
language plpgsql
as $$
begin
  -- Unconditional: a completed/cancelled order's status can never change
  -- again, through any path, until a dedicated reversal RPC exists.
  if old.status in ('completed', 'cancelled') and new.status is distinct from old.status then
    raise exception 'No se puede cambiar el estado de un pedido completado o cancelado' using errcode = 'VC409';
  end if;

  if current_setting('app.bypass_order_guard', true) is distinct from 'on' then
    if new.total is distinct from old.total
       or new.delivery_fee is distinct from old.delivery_fee then
      raise exception 'No se puede modificar el total del pedido directamente' using errcode = 'VC409';
    end if;
  end if;
  return new;
end;
$$;

-- Grant cleanup: anon should never have been able to call these (both
-- reject anon internally via auth.uid() is null, but the grant itself is
-- unnecessary surface).
revoke all on function public.update_order(
  uuid, text, text, text, text, text, text, text, text, jsonb, integer
) from anon;

revoke all on function public.create_branch_with_admin(
  text, text, public.business_vertical, text
) from anon;
