import type { MovementType, PaymentMethod } from '@/types';
import { computeCashBalance } from '@/lib/cashBalance';

/**
 * Minimal movement shape both KPI calculators need. Pure, no Supabase IO —
 * callers (page.tsx, closings.ts) fetch rows and pass them in.
 */
export interface KpiMovement {
  type: MovementType;
  income: number;
  expense: number;
  payment_method: PaymentMethod | null;
  comment: string | null;
}

export interface PeriodActivity {
  totalIncome: number;
  incomeByMethod: { efectivo: number; transferencia: number; pos: number };
  totalExpenses: number;
}

export interface RunningBalance {
  balanceEfectivo: number;
  balanceGlobal: number;
}

function sumIncome(movements: KpiMovement[]): number {
  return movements.reduce((sum, m) => sum + (m.income || 0), 0);
}

function sumExpense(movements: KpiMovement[]): number {
  return movements.reduce((sum, m) => sum + (m.expense || 0), 0);
}

function byMethod(movements: KpiMovement[], method: PaymentMethod): number {
  return sumIncome(movements.filter((m) => m.payment_method === method));
}

/**
 * Period activity: Total Ingresos (servicio only, all methods), income split
 * by payment method, Total Gastos (gasto only). `apertura` is capital, not
 * "income" — it never contributes here (see calcRunningBalance instead).
 * `cierre` is a running-balance concern only, never period activity.
 */
export function calcCashBoxKPIs(movements: KpiMovement[]): PeriodActivity {
  const servicios = movements.filter((m) => m.type === 'servicio');
  const gastos = movements.filter((m) => m.type === 'gasto');

  return {
    totalIncome: sumIncome(servicios),
    incomeByMethod: {
      efectivo: byMethod(servicios, 'efectivo'),
      transferencia: byMethod(servicios, 'transferencia'),
      pos: byMethod(servicios, 'pos'),
    },
    totalExpenses: sumExpense(gastos),
  };
}

/**
 * Always-current running balance (not period-scoped by the Hoy/Semana/Mes
 * toggle — callers pass movements since the last cash_closing, or all-time).
 *
 * Delegates all math to the shared computeCashBalance (src/lib/cashBalance.ts,
 * see its doc comment for the full invariant/reasoning) — this function only
 * adapts its result shape to RunningBalance for existing callers.
 */
export function calcRunningBalance(movements: KpiMovement[]): RunningBalance {
  const { efectivo, global } = computeCashBalance(movements);

  return {
    balanceEfectivo: efectivo,
    balanceGlobal: global,
  };
}
