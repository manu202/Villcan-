-- SW-O4: delivery fee has no edit path after initial entry
-- (confirm_order_delivery_fee, 20260922060000, only ever sets it once while
-- confirming a pending order). Adds a narrowly-scoped SECURITY DEFINER RPC
-- to edit the fee of an order that is already confirmed, following the same
-- auth-check + `app.bypass_order_guard` pattern as update_order/
-- confirm_order_delivery_fee, reusing the O-6 non-negative-fee guard
-- (df53493, "Costo de delivery invalido" / VC400).
--
-- No UI wiring yet -- nothing calls this RPC (backend-only scaffolding per
-- the audit's Package 2 backend-only track).
--
-- Scoped to status='confirmed' only: a pending order should go through
-- confirm_order_delivery_fee instead (setting the fee is part of
-- confirming it), and the O-1/M-2 status-freeze trigger
-- (_guard_order_financial_fields) already unconditionally blocks any
-- financial-field change once an order is completed/cancelled -- this RPC
-- checks the same condition itself first so it raises a clear VC409
-- instead of falling through to the trigger's own error text.

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
  v_order    record;
  v_new_total integer;
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

  v_new_total := v_order.total - coalesce(v_order.delivery_fee, 0) + p_delivery_fee;

  perform set_config('app.bypass_order_guard', 'on', true);

  update public.orders
    set delivery_fee = p_delivery_fee,
        total        = v_new_total
    where id = p_order_id;

  return jsonb_build_object('order_id', p_order_id, 'delivery_fee', p_delivery_fee, 'total', v_new_total);
end;
$$;

revoke all on function public.edit_confirmed_order_delivery_fee(uuid, integer) from public;
revoke all on function public.edit_confirmed_order_delivery_fee(uuid, integer) from anon;
grant execute on function public.edit_confirmed_order_delivery_fee(uuid, integer) to authenticated;

-- DOWN (manual):
--   drop function if exists public.edit_confirmed_order_delivery_fee(uuid, integer);
