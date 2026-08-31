// Pure commission-calculation helpers (REQ-PROFIT-1/2).
// Commission source is GLOBAL-ONLY: business_settings.default_commission_pct.
// No per-staff override in this pass (deferred as a future enhancement).

interface CommissionSettings {
  commissions_enabled: boolean;
  default_commission_pct: number;
}

/**
 * Resolves the commission percentage to freeze on a `servicio` movement at
 * insert time. Returns null when commissions are disabled (toggle wins over
 * any configured default), so the column stays NULL and nothing visibly
 * changes for businesses that don't use commissions.
 */
export function computeCommissionPct(settings: CommissionSettings): number | null {
  return settings.commissions_enabled ? settings.default_commission_pct : null;
}

/**
 * Computes the commission amount earned on a charged amount, given a frozen
 * percentage. A null pct (commissions not applicable) always yields 0.
 */
export function computeCommissionAmount(amountCharged: number, pct: number | null): number {
  if (pct === null || pct === undefined) return 0;
  return (amountCharged * pct) / 100;
}
