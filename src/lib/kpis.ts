import type { MovementType, PaymentMethod } from '@/types';

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
 * balanceEfectivo = apertura.income + servicio.income[efectivo]
 *                   - gasto.expense[comment NOT LIKE '%Cta Bancaria%'] - cierre.expense
 * balanceGlobal   = apertura.income + servicio.income[all methods]
 *                   - gasto.expense[ALL] - cierre.expense
 */
export function calcRunningBalance(movements: KpiMovement[]): RunningBalance {
  const aperturaIncome = sumIncome(movements.filter((m) => m.type === 'apertura'));
  const servicios = movements.filter((m) => m.type === 'servicio');
  const gastos = movements.filter((m) => m.type === 'gasto');
  const cierreExpense = sumExpense(movements.filter((m) => m.type === 'cierre'));

  const efectivoIncome = byMethod(servicios, 'efectivo');
  const allServicioIncome = sumIncome(servicios);

  const gastosNonBank = sumExpense(gastos.filter((m) => !m.comment?.includes('Cta Bancaria')));
  const gastosAll = sumExpense(gastos);

  return {
    balanceEfectivo: aperturaIncome + efectivoIncome - gastosNonBank - cierreExpense,
    balanceGlobal: aperturaIncome + allServicioIncome - gastosAll - cierreExpense,
  };
}
