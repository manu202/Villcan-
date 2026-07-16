// Pure aggregation for the "Liquidación por barbero" report (REQ-PROFIT-5).
import { computeCommissionAmount } from './commission';

export interface LiquidacionMovementInput {
  user_id: string;
  userName: string;
  amountCharged: number;
  commissionPct: number | null;
}

export interface LiquidacionRow {
  userId: string;
  userName: string;
  facturado: number;
  commission: number;
}

/**
 * Groups servicio movements by barber (user_id), summing the amount charged
 * (facturado) and the commission earned per movement (NULL commission_pct
 * treated as 0, via computeCommissionAmount). Sorted by facturado desc.
 */
export function computeLiquidacionByBarber(
  movements: LiquidacionMovementInput[]
): LiquidacionRow[] {
  const byUser = new Map<string, LiquidacionRow>();

  for (const m of movements) {
    const existing = byUser.get(m.user_id);
    const commission = computeCommissionAmount(m.amountCharged, m.commissionPct);

    if (existing) {
      existing.facturado += m.amountCharged;
      existing.commission += commission;
    } else {
      byUser.set(m.user_id, {
        userId: m.user_id,
        userName: m.userName,
        facturado: m.amountCharged,
        commission,
      });
    }
  }

  return Array.from(byUser.values()).sort((a, b) => b.facturado - a.facturado);
}
