import { describe, it, expect } from 'vitest';
import { getContactVisitAggregate } from './contactAggregates';
import type { Movement } from '@/types';

function servicio(daysAgo: number, overrides: Partial<Movement> = {}): Movement {
  const created = new Date('2026-07-16T12:00:00.000Z');
  created.setDate(created.getDate() - daysAgo);
  return {
    id: `m-${daysAgo}-${Math.random()}`,
    type: 'servicio',
    amount_charged: 35000,
    commission_pct: null,
    income: 35000,
    expense: 0,
    payment_method: 'efectivo',
    contact_id: 'contact-1',
    service_id: 'service-1',
    user_id: 'user-1',
    branch_id: 'branch-1',
    comment: null,
    created_at: created.toISOString(),
    ...overrides,
  };
}

function gasto(daysAgo: number): Movement {
  const created = new Date('2026-07-16T12:00:00.000Z');
  created.setDate(created.getDate() - daysAgo);
  return {
    id: `g-${daysAgo}-${Math.random()}`,
    type: 'gasto',
    amount_charged: null,
    commission_pct: null,
    income: 0,
    expense: 5000,
    payment_method: null,
    contact_id: 'contact-1',
    service_id: null,
    user_id: 'user-1',
    branch_id: 'branch-1',
    comment: 'insumos',
    created_at: created.toISOString(),
  };
}

const NOW = new Date('2026-07-16T12:00:00.000Z');

describe('getContactVisitAggregate (REQ-CRM-1)', () => {
  it('counts only servicio movements and reports the most recent as lastVisit', () => {
    const mostRecent = servicio(5);
    const movements = [
      servicio(10),
      mostRecent,
      servicio(20),
      gasto(1),
    ];

    const result = getContactVisitAggregate(movements, NOW);

    expect(result.visitCount).toBe(3);
    expect(result.lastVisit).toBe(mostRecent.created_at);
  });

  it('returns zero visits, null lastVisit, and not-frequent for an empty movements list', () => {
    const result = getContactVisitAggregate([], NOW);

    expect(result).toEqual({ visitCount: 0, lastVisit: null, isFrequent: false });
  });
});

describe('getContactVisitAggregate — frequent-client heuristic (REQ-CRM-2)', () => {
  it('is frequent when there are exactly 3 servicio movements within the last 60 days (boundary met)', () => {
    const movements = [servicio(59), servicio(30), servicio(0)];

    const result = getContactVisitAggregate(movements, NOW);

    expect(result.isFrequent).toBe(true);
  });

  it('is NOT frequent with only 2 servicio movements within 60 days, even with older visits beyond the window', () => {
    const movements = [servicio(10), servicio(40), servicio(90), servicio(120)];

    const result = getContactVisitAggregate(movements, NOW);

    expect(result.isFrequent).toBe(false);
  });

  it('excludes a visit that falls exactly outside the 60-day window (boundary not met)', () => {
    // 61 days ago is outside the window; only 2 qualify -> not frequent
    const movements = [servicio(61), servicio(30), servicio(10)];

    const result = getContactVisitAggregate(movements, NOW);

    expect(result.isFrequent).toBe(false);
  });
});
