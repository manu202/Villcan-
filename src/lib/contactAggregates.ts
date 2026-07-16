import type { Movement } from '@/types';

// Frequent-client heuristic: 3+ servicio movements within the last 60 days.
// Hardcoded per REQ-CRM-2 — not a business_settings toggle in v1.
const FREQUENT_VISIT_THRESHOLD = 3;
const FREQUENT_WINDOW_DAYS = 60;

export interface ContactVisitAggregate {
  visitCount: number;
  lastVisit: string | null;
  isFrequent: boolean;
}

/**
 * Pure aggregate over a contact's movements. Computed live — never stored.
 * Only `type === 'servicio'` movements count as visits.
 */
export function getContactVisitAggregate(
  movements: Movement[],
  now: Date = new Date()
): ContactVisitAggregate {
  const visits = movements.filter((m) => m.type === 'servicio');

  if (visits.length === 0) {
    return { visitCount: 0, lastVisit: null, isFrequent: false };
  }

  const sorted = [...visits].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const lastVisit = sorted[0].created_at;

  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() - FREQUENT_WINDOW_DAYS);

  const recentVisitCount = visits.filter(
    (m) => new Date(m.created_at).getTime() >= windowStart.getTime()
  ).length;

  return {
    visitCount: visits.length,
    lastVisit,
    isFrequent: recentVisitCount >= FREQUENT_VISIT_THRESHOLD,
  };
}
