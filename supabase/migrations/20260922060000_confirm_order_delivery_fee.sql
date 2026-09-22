-- =============================================================================
-- confirm_order_delivery_fee
--
-- Fixes a real production bug found 2026-09-22: OrderCard.tsx's delivery-fee
-- form (the "aceptar pedido" flow for a delivery order) calls
-- updateOrderStatus (src/lib/data/orders.ts), a plain
-- `.from('orders').update({ status, delivery_fee }).eq('id', orderId)` —
-- direct against the table, no RPC. The `_guard_order_financial_fields`
-- trigger added in 20260922010000_freeze_completed_orders_and_grant_cleanup.sql
-- (closing O-2: no direct-table tampering with total/delivery_fee) rightly
-- blocks any direct delivery_fee change and has no bypass for it — that
-- migration's own comment assumed no legitimate caller needed to set
-- delivery_fee outside update_order/create_manual_order, which was wrong:
-- this confirm-with-fee flow is exactly such a caller, and every real
-- "confirmar pedido con delivery" in production has 400'd since that guard
-- shipped.
--
-- Fix: a small dedicated SECURITY DEFINER RPC, following the same
-- auth-check + `app.bypass_order_guard` pattern as update_order/
-- create_manual_order, scoped narrowly to exactly this one transition
-- (pending delivery order -> confirmed, with its delivery fee set once).
-- The item-6 guard itself is untouched — direct client updates to
-- delivery_fee stay blocked for every other path, which is the point.
-- =============================================================================

create or replace function public.confirm_order_delivery_fee(
  p_order_id     uuid,
  p_delivery_fee integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order record;
begin
  select id, branch_id, status, delivery_type
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

  if v_order.delivery_type <> 'delivery' then
    raise exception 'El pedido no es de tipo delivery' using errcode = 'VC400';
  end if;

  if v_order.status <> 'pending' then
    raise exception 'El pedido ya no esta pendiente' using errcode = 'VC409';
  end if;

  if p_delivery_fee is null or p_delivery_fee < 0 then
    raise exception 'Costo de delivery invalido' using errcode = 'VC400';
  end if;

  perform set_config('app.bypass_order_guard', 'on', true);

  update public.orders
    set status = 'confirmed',
        delivery_fee = p_delivery_fee
    where id = p_order_id;

  return jsonb_build_object('order_id', p_order_id, 'delivery_fee', p_delivery_fee);
end;
$$;

revoke all on function public.confirm_order_delivery_fee(uuid, integer) from public;
revoke all on function public.confirm_order_delivery_fee(uuid, integer) from anon;
grant execute on function public.confirm_order_delivery_fee(uuid, integer) to authenticated;
