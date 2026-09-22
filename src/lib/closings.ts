import { createClient } from '@/lib/supabase/client';
import type { ArqueoAmounts, CashClosing, PaymentMethod } from '@/types';
import { calcRunningBalance, type KpiMovement, type RunningBalance } from '@/lib/kpis';
import { computeCashBalance, type CashBalanceMovement } from '@/lib/cashBalance';

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
  const supabase = createClient();

  const { data: serviceMovements } = await supabase
    .from('movements')
    .select('income, payment_method')
    .eq('type', 'servicio')
    .eq('branch_id', branchId)
    .gte('created_at', periodStart);

  const { data: aperturaMovements } = await supabase
    .from('movements')
    .select('income')
    .eq('type', 'apertura')
    .eq('branch_id', branchId)
    .gte('created_at', periodStart);

  const { data: expenseMovements } = await supabase
    .from('movements')
    .select('expense, comment')
    .eq('type', 'gasto')
    .eq('branch_id', branchId)
    .gte('created_at', periodStart);

  const { data: cierreMovements } = await supabase
    .from('movements')
    .select('expense')
    .eq('type', 'cierre')
    .eq('branch_id', branchId)
    .gte('created_at', periodStart);

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
  const supabase = createClient();

  const { data } = await supabase
    .from('cash_closings')
    .select('*')
    .eq('branch_id', branchId)
    .order('closed_at', { ascending: false })
    .limit(1);

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
  const supabase = createClient();
  const lastClosing = await getLastClosing(branchId);
  const since = lastClosing?.closed_at;

  const movementTypes = ['apertura', 'servicio', 'gasto', 'cierre'] as const;

  const results = await Promise.all(
    movementTypes.map((type) => {
      let query = supabase
        .from('movements')
        .select('type, income, expense, payment_method, comment')
        .eq('type', type)
        .eq('branch_id', branchId);

      if (since) {
        query = query.gte('created_at', since);
      }

      return query;
    })
  );

  const movements: KpiMovement[] = results.flatMap(
    (r) => (r.data || []) as KpiMovement[]
  );

  return calcRunningBalance(movements);
}
