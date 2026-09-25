import { createClient } from '@/lib/supabase/client';
import type { CashClosingInsert } from '@/lib/arqueo';

/**
 * `servicio`-type movements for a branch since `periodStart`, used by
 * getCalculatedBalanceSince (src/lib/closings.ts) to compute the cash
 * balance's service-income leg.
 */
export async function listServiceMovementsSince(branchId: string, periodStart: string) {
  const supabase = createClient();
  return supabase
    .from('movements')
    .select('income, payment_method')
    .eq('type', 'servicio')
    .eq('branch_id', branchId)
    .gte('created_at', periodStart);
}

/**
 * `apertura`-type movements for a branch since `periodStart`, used by
 * getCalculatedBalanceSince (src/lib/closings.ts).
 */
export async function listAperturaMovementsSince(branchId: string, periodStart: string) {
  const supabase = createClient();
  return supabase
    .from('movements')
    .select('income')
    .eq('type', 'apertura')
    .eq('branch_id', branchId)
    .gte('created_at', periodStart);
}

/**
 * `gasto`-type movements for a branch since `periodStart`, used by
 * getCalculatedBalanceSince (src/lib/closings.ts).
 */
export async function listExpenseMovementsSince(branchId: string, periodStart: string) {
  const supabase = createClient();
  return supabase
    .from('movements')
    .select('expense, comment, expense_source')
    .eq('type', 'gasto')
    .eq('branch_id', branchId)
    .gte('created_at', periodStart);
}

/**
 * `cierre`-type movements for a branch since `periodStart`, used by
 * getCalculatedBalanceSince (src/lib/closings.ts).
 */
export async function listCierreMovementsSince(branchId: string, periodStart: string) {
  const supabase = createClient();
  return supabase
    .from('movements')
    .select('expense')
    .eq('type', 'cierre')
    .eq('branch_id', branchId)
    .gte('created_at', periodStart);
}

/**
 * Most recent cash_closings row for a branch (or none). Used by
 * getLastClosing (src/lib/closings.ts) to find the next closing's
 * period_start.
 */
export async function getLastCashClosing(branchId: string) {
  const supabase = createClient();
  return supabase
    .from('cash_closings')
    .select('*')
    .eq('branch_id', branchId)
    .order('closed_at', { ascending: false })
    .limit(1);
}

/**
 * Movements of one type for a branch, optionally since a given timestamp.
 * Used by getRunningCashBalance (src/lib/closings.ts), which queries all
 * four movement types in parallel with this same shape.
 */
export async function listMovementsByTypeSince(
  branchId: string,
  type: 'apertura' | 'servicio' | 'gasto' | 'cierre',
  since?: string
) {
  const supabase = createClient();
  let query = supabase
    .from('movements')
    .select('type, income, expense, payment_method, comment, expense_source')
    .eq('type', type)
    .eq('branch_id', branchId);

  if (since) {
    query = query.gte('created_at', since);
  }

  return query;
}

/** ClosingWizard's confirm step: inserts the built closing payload. */
export async function insertCashClosing(payload: CashClosingInsert) {
  const supabase = createClient();
  return supabase.from('cash_closings').insert(payload);
}

/**
 * Paginated (capped at 100) cash_closings history for a branch, newest
 * first, joined with branch name and closer's profile name. Used by
 * ClosingsHistoryPage.
 */
export async function listCashClosingsForBranch(branchId: string) {
  const supabase = createClient();
  return supabase
    .from('cash_closings')
    .select(`
      id, closed_at, arqueo_enabled,
      calculated_efectivo, calculated_transferencia, calculated_pos, calculated_total,
      counted_efectivo, counted_transferencia, counted_pos,
      discrepancy_efectivo, discrepancy_transferencia, discrepancy_pos,
      branch:branches(name),
      closed_by_profile:profiles!cash_closings_closed_by_fkey(full_name)
    `)
    .eq('branch_id', branchId)
    .order('closed_at', { ascending: false })
    .limit(100);
}

/**
 * Single cash_closings row by id, same select shape (columns + joins) as
 * listCashClosingsForBranch. Used by the closing detail page
 * (src/app/(app)/closings/[id]/page.tsx).
 */
export async function getCashClosingById(id: string) {
  const supabase = createClient();
  return supabase
    .from('cash_closings')
    .select(`
      id, closed_at, arqueo_enabled,
      calculated_efectivo, calculated_transferencia, calculated_pos, calculated_total,
      counted_efectivo, counted_transferencia, counted_pos,
      discrepancy_efectivo, discrepancy_transferencia, discrepancy_pos,
      branch:branches(name),
      closed_by_profile:profiles!cash_closings_closed_by_fkey(full_name)
    `)
    .eq('id', id)
    .single();
}

/**
 * Count of orders still `pending`/`confirmed` (not yet completed/cancelled)
 * for a branch, used by ClosingWizard (S-5) to warn before closing a period
 * with unresolved orders still in flight — their eventual movements would
 * otherwise land in whatever period they complete in, silently.
 */
export async function countPendingOrdersForBranch(branchId: string) {
  const supabase = createClient();
  return supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('branch_id', branchId)
    .in('status', ['pending', 'confirmed']);
}
