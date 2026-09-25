-- M-10 (2026-09-25, found live cross-checking production order totals,
-- confirmed unexercised in production data before this fix landed):
-- edit_confirmed_order_delivery_fee (20260924040000) computed
--   v_new_total := v_order.total - coalesce(v_order.delivery_fee, 0) + p_delivery_fee
-- which assumes orders.total already includes the delivery fee. It never
-- does, anywhere else in this system: confirm_order_delivery_fee
-- (20260922060000) only ever sets delivery_fee, never total;
-- complete_order_payment computes `v_order.total + delivery_fee` on top of
-- it at completion time; both client display formulas (OrderCard.tsx,
-- OrderViewPanel.tsx) do `order.total + (delivery ? order.delivery_fee : 0)`.
-- The old formula silently double-counted the old fee in both the display
-- total and the eventual cash movement recorded at completion.
--
-- Fix: this RPC must never touch total, matching confirm_order_delivery_fee's
-- own contract exactly -- only delivery_fee changes here.

create or replace function public.edit_confirmed_order_delivery_fee(
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
  select id, branch_id, status, delivery_type, delivery_fee, total
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

  if v_order.status <> 'confirmed' then
    raise exception 'El pedido debe estar confirmado para editar el costo de delivery' using errcode = 'VC409';
  end if;

  if p_delivery_fee is null or p_delivery_fee < 0 then
    raise exception 'Costo de delivery invalido' using errcode = 'VC400';
  end if;

  perform set_config('app.bypass_order_guard', 'on', true);

  update public.orders
    set delivery_fee = p_delivery_fee
    where id = p_order_id;

  return jsonb_build_object('order_id', p_order_id, 'delivery_fee', p_delivery_fee, 'total', v_order.total);
end;
$$;

revoke all on function public.edit_confirmed_order_delivery_fee(uuid, integer) from public;
revoke all on function public.edit_confirmed_order_delivery_fee(uuid, integer) from anon;
grant execute on function public.edit_confirmed_order_delivery_fee(uuid, integer) to authenticated;

-- DOWN (manual, restores the buggy formula -- do not use except to revert
-- this exact fix):
--   see 20260924040000_edit_confirmed_order_delivery_fee.sql for the prior body.
