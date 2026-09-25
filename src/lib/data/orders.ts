import { createClient } from '@/lib/supabase/client';
import type { OrderStatus, CreateManualOrderInput, UpdateOrderInput } from '@/types';

/**
 * Orders + their items for a branch, newest first. Full order_items columns
 * (not just id/qty/name_snapshot) so the same in-memory order object can be
 * handed straight to OrderPaymentSheet (SW-O1) without a second fetch.
 *
 * `start`/`end` are optional (M-8 drill-down from Reports' "Servicios"
 * breakdown) — omitted entirely, the query is unscoped by date, matching
 * the page's original all-orders-for-branch behavior exactly.
 */
export async function listOrdersForBranch(branchId: string, start?: string, end?: string) {
  const supabase = createClient();
  let query = supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('branch_id', branchId)
    .order('created_at', { ascending: false });

  if (start) query = query.gte('created_at', start);
  if (end) query = query.lt('created_at', end);

  return query;
}

/**
 * SW-O6: `.select('id').single()` detects 0-row RLS/trigger blocks as an
 * error — a plain `.update().eq()` returns error:null even when no rows are
 * affected. Callers build `update` themselves (e.g. conditionally including
 * `delivery_fee`) so this stays a thin passthrough with zero behavior
 * change.
 */
export async function updateOrderStatus(
  orderId: string,
  update: { status: OrderStatus; delivery_fee?: number }
) {
  const supabase = createClient();
  return supabase
    .from('orders')
    .update(update)
    .eq('id', orderId)
    .select('id')
    .single();
}

/**
 * Single order with its items in one joined query. Used by OrderDetailSheet
 * (initial load + post-payment refetch) — NOT the same shape as
 * `getOrderAndItems` below (orders/[id]/page.tsx fetches order and
 * order_items as two separate queries instead), so the two stay distinct
 * functions rather than being forced into one.
 */
export async function getOrderWithItems(orderId: string) {
  const supabase = createClient();
  return supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('id', orderId)
    .single();
}

/**
 * Order and its items as two separate queries, run in parallel. Used by
 * orders/[id]/page.tsx (initial load, post-save refetch, post-payment
 * refetch) — see `getOrderWithItems` above for the other (joined) shape
 * used by OrderDetailSheet.
 */
export async function getOrderAndItems(orderId: string) {
  const supabase = createClient();
  const [orderResult, itemsResult] = await Promise.all([
    supabase.from('orders').select('*').eq('id', orderId).single(),
    supabase.from('order_items').select('*').eq('order_id', orderId),
  ]);
  return { orderResult, itemsResult };
}

/**
 * Confirms a pending delivery order and sets its delivery fee in one call.
 * Dedicated RPC (2026-09-22 fix) — a plain `updateOrderStatus(orderId,
 * { status: 'confirmed', delivery_fee })` goes straight to the `orders`
 * table and is blocked by the financial-fields guard trigger (it has no
 * legitimate reason to see this as anything but tampering); this is the
 * one legitimate caller that needs to set delivery_fee outside
 * update_order/create_manual_order, so it gets its own narrow RPC instead
 * of loosening that guard. See migration confirm_order_delivery_fee.
 */
export async function confirmOrderDeliveryFee(orderId: string, deliveryFee: number) {
  const supabase = createClient();
  return supabase.rpc('confirm_order_delivery_fee', {
    p_order_id: orderId,
    p_delivery_fee: deliveryFee,
  });
}

export async function updateOrder(params: UpdateOrderInput) {
  const supabase = createClient();
  return supabase.rpc('update_order', params);
}

export async function createManualOrder(params: CreateManualOrderInput) {
  const supabase = createClient();
  return supabase.rpc('create_manual_order', params);
}

/**
 * Atomic RPC (movement insert + order completion in one transaction,
 * idempotent against double-completion) instead of two separate writes.
 */
export async function completeOrderPayment(orderId: string, amountReceived: number | null) {
  const supabase = createClient();
  return supabase.rpc('complete_order_payment', {
    p_order_id: orderId,
    p_amount_received: amountReceived,
  });
}

/**
 * SW-O4: edits the delivery fee of an already-confirmed delivery order.
 * Distinct from confirmOrderDeliveryFee, which only sets the fee once while
 * confirming a pending order. Server-side guards: delivery orders only,
 * status must be 'confirmed', fee must be >= 0.
 */
export async function editConfirmedOrderDeliveryFee(orderId: string, deliveryFee: number) {
  const supabase = createClient();
  return supabase.rpc('edit_confirmed_order_delivery_fee', {
    p_order_id: orderId,
    p_delivery_fee: deliveryFee,
  });
}

/**
 * O-8: dedicated cancellation RPC requiring a non-blank reason, recorded on
 * the order (cancellation_reason/cancelled_at/cancelled_by). Server-side
 * guard: cannot cancel an order already completed/cancelled.
 */
export async function cancelOrder(orderId: string, reason: string) {
  const supabase = createClient();
  return supabase.rpc('cancel_order', {
    p_order_id: orderId,
    p_reason: reason,
  });
}
