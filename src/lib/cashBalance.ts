import type { MovementType, PaymentMethod } from '@/types';

/**
 * Minimal movement shape the shared cash-balance formula needs. Structurally
 * compatible with kpis.ts's `KpiMovement` on purpose, so kpis.ts can pass its
 * movements straight through, and closings.ts / reports/page.tsx only need to
 * tag their (separately-fetched, narrower) query results with `type` before
 * calling in.
 */
export interface CashBalanceMovement {
  type: MovementType;
  income: number;
  expense: number;
  payment_method: PaymentMethod | null;
  comment: string | null;
  /**
   * M-4: real column for the gasto cash/bank split (movements.expense_source,
   * scoped to type='gasto' by a DB CHECK). Optional so existing callers that
   * don't select/pass it (e.g. reports/page.tsx, out of scope for this
   * backend-only change) keep compiling unchanged -- isBankTagged treats a
   * missing/null value exactly like an unset column, falling back to the
   * comment tag. Meaningless for any non-gasto type.
   */
  expense_source?: 'caja' | 'cta_bancaria' | null;
}

export interface CashBalanceResult {
  /** Physical cash in the drawer: what an arqueo/cash-closing should count. */
  efectivo: number;
  /** Servicio income collected via transferencia (never touches the drawer). */
  transferencia: number;
  /** Servicio income collected via pos (never touches the drawer). */
  pos: number;
  /** Money in any form: efectivo + transferencia + pos, net of ALL expenses. */
  global: number;
}

/**
 * THE one formula for "cash/money balance since some point in time".
 *
 * Before this file existed, three call sites answered the same underlying
 * question — "given everything recorded since boundary X, how much is
 * there?" — with three subtly different formulas (M-3):
 *   - getCalculatedBalanceSince (closings.ts): arqueo/ClosingForm, an
 *     explicit `periodStart` boundary, compared against a physical count.
 *   - calcRunningBalance (kpis.ts): the dashboard's always-current balance,
 *     since the last cash_closing (or all-time if there is none).
 *   - the inline `balanceNeto` on the Reports page: `serviciosAmount -
 *     gastosTotal` for the selected view's date range — which ignored
 *     `apertura`, `cierre`, and the cash-vs-bank split entirely, and is why
 *     Reports disagreed with the other two for the same period.
 *
 * All three are really asking the exact same question; they only differ in
 * WHICH boundary (`since`) they use to select rows, which is a
 * data-fetching decision made by each caller, not a math decision. This
 * function only does the math, from a caller-supplied movements array.
 *
 * The invariant, reasoned from what each movement type physically means:
 *
 *  - `apertura` (opening float): physical cash placed in the drawer at the
 *    start of a period. Always cash, always added.
 *  - `servicio` (income): only the `efectivo` portion ever touches the
 *    physical drawer. `transferencia`/`pos` income is real money, so it
 *    counts toward `global`, but never toward `efectivo`.
 *  - `gasto` (expense): paid from the drawer by default. A `comment` tagged
 *    "[Cta Bancaria]" (see MovementForm.buildFinalComment) means it was paid
 *    from the bank account instead, so it must NOT reduce `efectivo` — it
 *    still reduces `global`, since the money left the business either way.
 *  - `cierre` ("Retiro de Caja"): a real withdrawal of physical cash out of
 *    the drawer. It always reduces `efectivo` (and therefore `global`) for
 *    whichever period it falls in: a closing/arqueo needs this because the
 *    drawer's TRUE count already reflects the withdrawal having happened; a
 *    live "how much cash is there right now" figure needs it for the same
 *    physical reason — the cash is gone. It must never be double-counted:
 *    as long as each period's boundary is the timestamp of the
 *    closing/withdrawal that ended the previous period (which is how every
 *    caller picks its `since`/`periodStart`), a given `cierre` movement
 *    falls inside exactly one period — the one it closes out — and is
 *    naturally excluded from the next one by the boundary itself, not by
 *    special-casing it here.
 *
 * Pure and Supabase-free: callers fetch rows (in whatever shape/queries
 * suit them) and adapt them into CashBalanceMovement[] before calling this.
 */
export function computeCashBalance(movements: CashBalanceMovement[]): CashBalanceResult {
  const aperturas = movements.filter((m) => m.type === 'apertura');
  const servicios = movements.filter((m) => m.type === 'servicio');
  const gastos = movements.filter((m) => m.type === 'gasto');
  const cierres = movements.filter((m) => m.type === 'cierre');

  // M-4: expense_source is the source of truth once set (the real column,
  // backfilled from the same tag for pre-existing rows -- see migration
  // 20260925000000). Only falls back to parsing the comment tag for a row
  // where the column is still null -- i.e. a gasto inserted by the UI
  // before it's wired to write the new column.
  const isBankTagged = (m: CashBalanceMovement) =>
    m.expense_source != null
      ? m.expense_source === 'cta_bancaria'
      : !!m.comment?.includes('Cta Bancaria');

  const aperturaTotal = sumIncome(aperturas);
  const efectivoIncome = sumIncome(servicios.filter((m) => m.payment_method === 'efectivo'));
  const transferenciaIncome = sumIncome(servicios.filter((m) => m.payment_method === 'transferencia'));
  const posIncome = sumIncome(servicios.filter((m) => m.payment_method === 'pos'));

  const gastosCash = sumExpense(gastos.filter((m) => !isBankTagged(m)));
  const gastosBank = sumExpense(gastos.filter(isBankTagged));
  const cierreTotal = sumExpense(cierres);

  const efectivo = aperturaTotal + efectivoIncome - gastosCash - cierreTotal;
  const global = efectivo + transferenciaIncome + posIncome - gastosBank;

  return {
    efectivo,
    transferencia: transferenciaIncome,
    pos: posIncome,
    global,
  };
}

function sumIncome(movements: CashBalanceMovement[]): number {
  return movements.reduce((sum, m) => sum + (m.income || 0), 0);
}

function sumExpense(movements: CashBalanceMovement[]): number {
  return movements.reduce((sum, m) => sum + (m.expense || 0), 0);
}
