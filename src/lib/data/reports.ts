import { createClient } from '@/lib/supabase/client';

/**
 * `servicio`-type movements for the reports period (and optional branch),
 * with amount/payment/order linkage plus the (always-null, see QA-3)
 * services join. Used by ReportsPage for the KPI cards, per-method
 * breakdown, and to derive the order_ids for the per-service breakdown.
 */
export async function listServicioMovementsForReports(
  start: string,
  end: string,
  branchId?: string
) {
  const supabase = createClient();
  let query = supabase
    .from('movements')
    .select(`
      amount_charged, income, expense, payment_method, created_at, branch_id, order_id,
      service:services(name)
    `)
    .eq('type', 'servicio')
    .gte('created_at', start)
    .lt('created_at', end);

  if (branchId) {
    query = query.eq('branch_id', branchId);
  }

  return query;
}

/**
 * order_items for the given order_ids, used by ReportsPage to build the
 * per-service breakdown from the same orders already counted by
 * listServicioMovementsForReports.
 */
export async function listOrderItemsForOrders(orderIds: string[]) {
  const supabase = createClient();
  return supabase
    .from('order_items')
    .select('name_snapshot, line_total, qty')
    .in('order_id', orderIds);
}

/**
 * `gasto`-type movements for the reports period (and optional branch).
 * Used by ReportsPage for the expenses card and cash balance.
 */
export async function listGastoMovementsForReports(
  start: string,
  end: string,
  branchId?: string
) {
  const supabase = createClient();
  let query = supabase
    .from('movements')
    .select('expense, income, comment')
    .eq('type', 'gasto')
    .gte('created_at', start)
    .lt('created_at', end);

  if (branchId) {
    query = query.eq('branch_id', branchId);
  }

  return query;
}

/**
 * `apertura`-type movements for the reports period (and optional branch).
 * Used by ReportsPage's Balance Neto (via computeCashBalance).
 */
export async function listAperturaMovementsForReports(
  start: string,
  end: string,
  branchId?: string
) {
  const supabase = createClient();
  let query = supabase
    .from('movements')
    .select('income')
    .eq('type', 'apertura')
    .gte('created_at', start)
    .lt('created_at', end);

  if (branchId) {
    query = query.eq('branch_id', branchId);
  }

  return query;
}

/**
 * `cierre`-type movements for the reports period (and optional branch).
 * Used by ReportsPage's Balance Neto (via computeCashBalance).
 */
export async function listCierreMovementsForReports(
  start: string,
  end: string,
  branchId?: string
) {
  const supabase = createClient();
  let query = supabase
    .from('movements')
    .select('expense')
    .eq('type', 'cierre')
    .gte('created_at', start)
    .lt('created_at', end);

  if (branchId) {
    query = query.eq('branch_id', branchId);
  }

  return query;
}

/**
 * `servicio`-type movement income for the previous comparison period (and
 * optional branch). Used by ReportsPage to compute the period-over-period
 * percentage badge.
 */
export async function listServicioIncomeForPrevPeriod(
  start: string,
  end: string,
  branchId?: string
) {
  const supabase = createClient();
  let query = supabase
    .from('movements')
    .select('income')
    .eq('type', 'servicio')
    .gte('created_at', start)
    .lt('created_at', end);

  if (branchId) {
    query = query.eq('branch_id', branchId);
  }

  return query;
}

/**
 * `servicio`-type movements for the liquidacion period (and optional
 * branch), joined with the assigned staff profile's name. Used by
 * LiquidacionPage to compute per-staff facturado/commission via
 * computeLiquidacionByStaff.
 */
export async function listServicioMovementsForLiquidacion(
  start: string,
  end: string,
  branchId?: string
) {
  const supabase = createClient();
  let query = supabase
    .from('movements')
    .select(`
      amount_charged, commission_pct, user_id,
      user:profiles(full_name)
    `)
    .eq('type', 'servicio')
    .gte('created_at', start)
    .lt('created_at', end);

  if (branchId) {
    query = query.eq('branch_id', branchId);
  }

  return query;
}
