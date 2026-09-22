-- =============================================================================
-- atomic_order_payment_completion
--
-- Fixes O-4: marking an order paid/completed was two separate, non-atomic,
-- non-idempotent client writes (movements.insert, then orders.update) with
-- no transaction. A failure between them left a movement for a still-
-- pending order, and nothing stopped completing the same order twice
-- (inserting a second movement for it).
--
-- Fix: one SECURITY DEFINER RPC that does both writes in a single
-- transaction (implicit — a plpgsql function body IS one transaction) and
-- explicitly refuses to run again on an order that's already
-- completed/cancelled (idempotency + respects the M-2 freeze invariant).
-- =============================================================================

create or replace function public.complete_order_payment(
  p_order_id uuid,
  p_amount_received integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order        record;
  v_final_total  integer;
  v_expense      integer := 0;
  v_movement_id  uuid;
begin
  select id, branch_id, contact_id, total, delivery_type, delivery_fee,
         payment_method, order_code, status
    into v_order
    from public.orders
    where id = p_order_id
    limit 1;

  if v_order.id is null then
    raise exception 'Pedido no encontrado' using errcode = 'VC404';
  end if;

  -- Idempotency + respects the same freeze invariant as update_order/the
  -- orders_guard_financial_fields trigger: a completed/cancelled order
  -- cannot be completed again.
  if v_order.status in ('completed', 'cancelled') then
    raise exception 'El pedido ya esta completado o cancelado' using errcode = 'VC409';
  end if;

  -- Autorización: admin/user de la sucursal (SECURITY DEFINER bypasses RLS,
  -- so the check has to happen explicitly here, same pattern as every other
  -- order RPC).
  if not exists (
    select 1 from public.user_branch_access
    where branch_id = v_order.branch_id
      and user_id = auth.uid()
      and role in ('admin', 'user')
  ) then
    raise exception 'No autorizado' using errcode = 'VC403';
  end if;

  v_final_total := v_order.total + case
    when v_order.delivery_type = 'delivery' then coalesce(v_order.delivery_fee, 0)
    else 0
  end;

  if v_order.payment_method = 'efectivo' and p_amount_received is not null then
    v_expense := p_amount_received - v_final_total;
  end if;

  insert into public.movements (
    type, amount_charged, income, expense, payment_method,
    contact_id, user_id, branch_id, comment, order_id
  ) values (
    'servicio', v_final_total, v_final_total, v_expense, v_order.payment_method,
    v_order.contact_id, auth.uid(), v_order.branch_id,
    'Pedido ' || v_order.order_code, p_order_id
  )
  returning id into v_movement_id;

  -- Status-only change into 'completed' — the orders_guard_financial_fields
  -- trigger only blocks changes AWAY FROM completed/cancelled, so no bypass
  -- flag is needed for this direction.
  update public.orders set status = 'completed' where id = p_order_id;

  return jsonb_build_object(
    'order_id',    p_order_id,
    'movement_id', v_movement_id,
    'total',       v_final_total
  );
end;
$$;

revoke all on function public.complete_order_payment(uuid, integer) from public;
grant execute on function public.complete_order_payment(uuid, integer) to authenticated;
