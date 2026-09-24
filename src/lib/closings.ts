import type { ArqueoAmounts, CashClosing, PaymentMethod } from '@/types';
import { calcRunningBalance, type KpiMovement, type RunningBalance } from '@/lib/kpis';
import { computeCashBalance, type CashBalanceMovement } from '@/lib/cashBalance';
import {
  listServiceMovementsSince,
  listAperturaMovementsSince,
  listExpenseMovementsSince,
  listCierreMovementsSince,
  getLastCashClosing,
  listMovementsByTypeSince,
  countPendingOrdersForBranch,
} from '@/lib/data/closings';

/**
 * Calculates the system's expected cash-box balance per payment method,
 * for a branch, since `periodStart` up to now.
 *
 * Used by the arqueo/ClosingForm flow, scoped to an arbitrary period instead
 * of "today". Fetches each movement type with its own narrow `select(...)`
 * (unchanged below), then tags/adapts the rows into CashBalanceMovement[]
 * and delegates the actual math to the shared computeCashBalance
 * (src/lib/cashBalance.ts, see its doc comment for the full invariant).
 */
export async function getCalculatedBalanceSince(
  branchId: string,
  periodStart: string
): Promise<ArqueoAmounts> {
  const { data: serviceMovements } = await listServiceMovementsSince(branchId, periodStart);
  const { data: aperturaMovements } = await listAperturaMovementsSince(branchId, periodStart);
  const { data: expenseMovements } = await listExpenseMovementsSince(branchId, periodStart);
  const { data: cierreMovements } = await listCierreMovementsSince(branchId, periodStart);

  const services = (serviceMovements || []) as { income: number; payment_method: PaymentMethod | null }[];
  const aperturas = (aperturaMovements || []) as { income: number }[];
  const gastos = (expenseMovements || []) as { expense: number; comment: string | null }[];
  const cierres = (cierreMovements || []) as { expense: number }[];

  const movements: CashBalanceMovement[] = [
    ...aperturas.map((m) => ({
      type: 'apertura' as const,
      income: m.income || 0,
      expense: 0,
      payment_method: null,
      comment: null,
    })),
    ...services.map((m) => ({
      type: 'servicio' as const,
      income: m.income || 0,
      expense: 0,
      payment_method: m.payment_method,
      comment: null,
    })),
    ...gastos.map((m) => ({
      type: 'gasto' as const,
      income: 0,
      expense: m.expense || 0,
      payment_method: null,
      comment: m.comment,
    })),
    ...cierres.map((m) => ({
      type: 'cierre' as const,
      income: 0,
      expense: m.expense || 0,
      payment_method: null,
      comment: null,
    })),
  ];

  const { efectivo, transferencia, pos } = computeCashBalance(movements);

  return { efectivo, transferencia, pos };
}

/**
 * Returns the most recent cash_closings row for a branch, or null if the
 * branch has never closed the register. Used to determine the next
 * closing's period_start (from the prior closing's closed_at).
 */
export async function getLastClosing(branchId: string): Promise<CashClosing | null> {
  const { data } = await getLastCashClosing(branchId);

  const rows = (data || []) as CashClosing[];
  return rows[0] ?? null;
}

/**
 * Always-current running cash balance for a branch (Balance en Efectivo /
 * Balance Global), NOT scoped by any UI period toggle. Aggregates since the
 * last cash_closing's closed_at, or all-time if the branch has never closed.
 *
 * Same formula as getCalculatedBalanceSince (both delegate to
 * computeCashBalance, src/lib/cashBalance.ts) — this only differs in WHICH
 * boundary it uses: since the last cash_closing instead of an arbitrary
 * `periodStart`. `cierre` movements always reduce the balance in both, since
 * they are real physical cash withdrawals from the register.
 *
 * Delegates all math to calcRunningBalance (src/lib/kpis.ts) — this function
 * only fetches rows and picks the lower boundary.
 */
export async function getRunningCashBalance(branchId: string): Promise<RunningBalance> {
  const lastClosing = await getLastClosing(branchId);
  const since = lastClosing?.closed_at;

  const movementTypes = ['apertura', 'servicio', 'gasto', 'cierre'] as const;

  const results = await Promise.all(
    movementTypes.map((type) => listMovementsByTypeSince(branchId, type, since))
  );

  const movements: KpiMovement[] = results.flatMap(
    (r) => (r.data || []) as KpiMovement[]
  );

  return calcRunningBalance(movements);
}

/**
 * S-5: number of orders still in flight (`pending`/`confirmed`) for a
 * branch — used to warn (not block) before closing a period, since those
 * orders' eventual movements will land in whatever period they complete in.
 */
export async function getPendingOrdersCount(branchId: string): Promise<number> {
  const { count } = await countPendingOrdersForBranch(branchId);
  return count ?? 0;
}
