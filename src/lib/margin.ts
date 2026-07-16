// Pure margin-calculation helper (REQ-PROFIT-3/4).
// cost is null when not tracked for a service; treated as 0 so margin
// falls back to the full price (safe, current-behavior-preserving default).
export function computeMargin(price: number, cost: number | null): number {
  return price - (cost ?? 0);
}
