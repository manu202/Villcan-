import { createClient } from '@/lib/supabase/client';
import type { ArqueoAmounts, CashClosing } from '@/types';

/**
 * Calculates the system's expected cash-box balance per payment method,
 * for a branch, since `periodStart` up to now.
 *
 * Mirrors src/app/page.tsx's balanceEfectivo/balanceGlobal logic (see
 * REQ-CAJA-9), but scoped to an arbitrary period instead of "today", and
 * documents a decision NOT present in page.tsx: `apertura` movements have
 * no payment_method but are physically cash, so they are added into the
 * efectivo total here.
 *
 * calculated_efectivo = sum(servicio.income where payment_method=efectivo)
 *                      + sum(apertura.income)
 *                      - sum(gasto.expense where comment NOT tagged [Cta Bancaria])
 * calculated_transferencia/pos = sum(servicio.income) for that method.
 *
 * Existing `cierre` movements are intentionally excluded from this
 * calculation (known gap carried over from page.tsx, not solved here).
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

  const services = (serviceMovements || []) as { income: number; payment_method: string | null }[];
  const aperturas = (aperturaMovements || []) as { income: number }[];
  const gastos = (expenseMovements || []) as { expense: number; comment: string | null }[];

  const servicioEfectivo = services
    .filter((m) => m.payment_method === 'efectivo')
    .reduce((sum, m) => sum + (m.income || 0), 0);
  const transferencia = services
    .filter((m) => m.payment_method === 'transferencia')
    .reduce((sum, m) => sum + (m.income || 0), 0);
  const pos = services
    .filter((m) => m.payment_method === 'pos')
    .reduce((sum, m) => sum + (m.income || 0), 0);

  const aperturaTotal = aperturas.reduce((sum, m) => sum + (m.income || 0), 0);
  const gastosFromCaja = gastos
    .filter((m) => !m.comment?.includes('Cta Bancaria'))
    .reduce((sum, m) => sum + (m.expense || 0), 0);

  const efectivo = servicioEfectivo + aperturaTotal - gastosFromCaja;

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
