-- O-8: no dedicated cancellation flow/RPC, no reason/audit field. A direct
-- `.update({status:'cancelled'})` on a pending/confirmed order still works
-- today (nothing in this migration removes that path -- no UI calls this
-- RPC yet, this is backend-only scaffolding per the audit's Package 2
-- backend-only track), but there was no way to record *why* an order was
-- cancelled or who cancelled it. Adds a dedicated SECURITY DEFINER RPC that
-- requires a non-blank reason, following the same auth-check pattern as
-- update_order/confirm_order_delivery_fee, and three nullable audit columns.
--
-- Cannot un-cancel / re-cancel: the existing O-1/M-2 status-freeze trigger
-- (_guard_order_financial_fields, see
-- 20260922010000_freeze_completed_orders_and_grant_cleanup.sql) already
-- unconditionally blocks any status change once an order is
-- completed/cancelled, through any path including this RPC -- this
-- migration relies on that guard rather than duplicating it, and this RPC
-- also checks the same condition itself first so it raises a clear VC409
-- instead of falling through to the trigger's own error text.
--
-- No CHECK constraint tying cancellation_reason to status='cancelled':
-- that would also apply to the pre-existing direct-update cancel path,
-- which this backend-only change must not affect.

alter table public.orders
  add column cancellation_reason text,
  add column cancelled_at timestamptz,
  add column cancelled_by uuid references public.profiles(id);

create or replace function public.cancel_order(
  p_order_id uuid,
  p_reason   text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order record;
begin
  select id, branch_id, status
    into v_order
    from public.orders
    where id = p_order_id
    limit 1;

  if v_order.id is null then
    raise exception 'Pedido no encontrado' using errcode = 'VC404';
  end if;

  if not exists (
    select 1 from public.user_branch_access
    where branch_id = v_order.branch_id
      and user_id = auth.uid()
      and role in ('admin', 'user')
  ) then
    raise exception 'No autorizado' using errcode = 'VC403';
  end if;

  if v_order.status in ('completed', 'cancelled') then
    raise exception 'No se puede cancelar un pedido completado o ya cancelado' using errcode = 'VC409';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'Se requiere un motivo de cancelacion' using errcode = 'VC400';
  end if;

  update public.orders
    set status               = 'cancelled',
        cancellation_reason  = trim(p_reason),
        cancelled_at         = now(),
        cancelled_by         = auth.uid()
    where id = p_order_id;

  return jsonb_build_object('order_id', p_order_id, 'status', 'cancelled');
end;
$$;

revoke all on function public.cancel_order(uuid, text) from public;
revoke all on function public.cancel_order(uuid, text) from anon;
grant execute on function public.cancel_order(uuid, text) to authenticated;

-- DOWN (manual):
--   drop function if exists public.cancel_order(uuid, text);
--   alter table public.orders
--     drop column if exists cancellation_reason,
--     drop column if exists cancelled_at,
--     drop column if exists cancelled_by;
