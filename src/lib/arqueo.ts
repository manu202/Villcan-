import type { ArqueoAmounts, ArqueoDiscrepancy, CashClosing } from '@/types';

/**
 * Per-method discrepancy = counted - calculated.
 * Positive = surplus (more cash than expected), negative = faltante (missing).
 */
export function computeArqueoDiscrepancy(
  calculated: ArqueoAmounts,
  counted: ArqueoAmounts
): ArqueoDiscrepancy {
  return {
    efectivo: counted.efectivo - calculated.efectivo,
    transferencia: counted.transferencia - calculated.transferencia,
    pos: counted.pos - calculated.pos,
  };
}

export interface BuildClosingPayloadParams {
  calculated: ArqueoAmounts;
  /** null when mandatory_arqueo_enabled is OFF — no physical count was taken. */
  counted: ArqueoAmounts | null;
  arqueoEnabled: boolean;
  branchId: string;
  closedBy: string;
  periodStart: string;
  notes?: string | null;
}

export type CashClosingInsert = Omit<CashClosing, 'id' | 'closed_at' | 'created_at'>;

/**
 * Assembles the cash_closings row to insert.
 *
 * Toggle OFF (arqueoEnabled=false, counted=null): saves a calculated-only
 * snapshot — all counted_ and discrepancy_ fields are null. This is the
 * REQ-CAJA-3/9 passthrough case: today's zero-friction, one-tap behavior.
 *
 * Toggle ON: requires `counted`, computes discrepancy = counted - calculated
 * per payment method, and saves all fields.
 */
export function buildClosingPayload(params: BuildClosingPayloadParams): CashClosingInsert {
  const { calculated, counted, arqueoEnabled, branchId, closedBy, periodStart, notes = null } = params;
  const calculated_total = calculated.efectivo + calculated.transferencia + calculated.pos;

  const base = {
    branch_id: branchId,
    closed_by: closedBy,
    period_start: periodStart,
    calculated_efectivo: calculated.efectivo,
    calculated_transferencia: calculated.transferencia,
    calculated_pos: calculated.pos,
    calculated_total,
    notes,
  };

  if (!arqueoEnabled || !counted) {
    return {
      ...base,
      arqueo_enabled: false,
      counted_efectivo: null,
      counted_transferencia: null,
      counted_pos: null,
      discrepancy_efectivo: null,
      discrepancy_transferencia: null,
      discrepancy_pos: null,
    };
  }

  const discrepancy = computeArqueoDiscrepancy(calculated, counted);

  return {
    ...base,
    arqueo_enabled: true,
    counted_efectivo: counted.efectivo,
    counted_transferencia: counted.transferencia,
    counted_pos: counted.pos,
    discrepancy_efectivo: discrepancy.efectivo,
    discrepancy_transferencia: discrepancy.transferencia,
    discrepancy_pos: discrepancy.pos,
  };
}
