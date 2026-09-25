import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  listServiceMovementsSince,
  listAperturaMovementsSince,
  listExpenseMovementsSince,
  listCierreMovementsSince,
  getLastCashClosing,
  listMovementsByTypeSince,
  insertCashClosing,
  listCashClosingsForBranch,
} from './closings';

let lastTable: string | null = null;
let lastSelectArg: string | null = null;
let lastEqArgs: [string, unknown][] = [];
let lastGteArgs: [string, unknown] | null = null;
let lastOrderArgs: [string, unknown] | null = null;
let lastLimitArg: number | null = null;
let lastInsertArgs: unknown = null;
let resolvedValue: unknown = { data: [], error: null };

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      lastTable = table;
      const mock: Record<string, unknown> = {};
      mock.select = (arg: string) => {
        lastSelectArg = arg;
        return mock;
      };
      mock.eq = (field: string, value: unknown) => {
        lastEqArgs.push([field, value]);
        return mock;
      };
      mock.gte = (field: string, value: unknown) => {
        lastGteArgs = [field, value];
        return mock;
      };
      mock.order = (field: string, opts?: unknown) => {
        lastOrderArgs = [field, opts];
        return mock;
      };
      mock.limit = (n: number) => {
        lastLimitArg = n;
        return Promise.resolve(resolvedValue);
      };
      mock.insert = (payload: unknown) => {
        lastInsertArgs = payload;
        return Promise.resolve(resolvedValue);
      };
      // Terminal for chains that end without .limit()/.insert().
      mock.then = (resolve: (v: unknown) => unknown) => Promise.resolve(resolvedValue).then(resolve);
      return mock;
    },
  }),
}));

beforeEach(() => {
  lastTable = null;
  lastSelectArg = null;
  lastEqArgs = [];
  lastGteArgs = null;
  lastOrderArgs = null;
  lastLimitArg = null;
  lastInsertArgs = null;
  resolvedValue = { data: [], error: null };
});

describe('listServiceMovementsSince (getCalculatedBalanceSince servicio leg)', () => {
  it('queries movements filtered by type=servicio, branch_id, and gte created_at', async () => {
    await listServiceMovementsSince('branch-1', '2026-07-15T00:00:00.000Z');
    expect(lastTable).toBe('movements');
    expect(lastSelectArg).toBe('income, payment_method');
    expect(lastEqArgs).toContainEqual(['type', 'servicio']);
    expect(lastEqArgs).toContainEqual(['branch_id', 'branch-1']);
    expect(lastGteArgs).toEqual(['created_at', '2026-07-15T00:00:00.000Z']);
  });
});

describe('listAperturaMovementsSince (getCalculatedBalanceSince apertura leg)', () => {
  it('queries movements filtered by type=apertura', async () => {
    await listAperturaMovementsSince('branch-1', '2026-07-15T00:00:00.000Z');
    expect(lastTable).toBe('movements');
    expect(lastSelectArg).toBe('income');
    expect(lastEqArgs).toContainEqual(['type', 'apertura']);
    expect(lastEqArgs).toContainEqual(['branch_id', 'branch-1']);
  });
});

describe('listExpenseMovementsSince (getCalculatedBalanceSince gasto leg)', () => {
  it('queries movements filtered by type=gasto', async () => {
    await listExpenseMovementsSince('branch-1', '2026-07-15T00:00:00.000Z');
    expect(lastTable).toBe('movements');
    expect(lastSelectArg).toBe('expense, comment, expense_source');
    expect(lastEqArgs).toContainEqual(['type', 'gasto']);
    expect(lastEqArgs).toContainEqual(['branch_id', 'branch-1']);
  });
});

describe('listCierreMovementsSince (getCalculatedBalanceSince cierre leg)', () => {
  it('queries movements filtered by type=cierre', async () => {
    await listCierreMovementsSince('branch-1', '2026-07-15T00:00:00.000Z');
    expect(lastTable).toBe('movements');
    expect(lastSelectArg).toBe('expense');
    expect(lastEqArgs).toContainEqual(['type', 'cierre']);
    expect(lastEqArgs).toContainEqual(['branch_id', 'branch-1']);
  });
});

describe('getLastCashClosing (getLastClosing support)', () => {
  it('queries cash_closings by branch_id, ordered by closed_at desc, capped at 1', async () => {
    await getLastCashClosing('branch-1');
    expect(lastTable).toBe('cash_closings');
    expect(lastEqArgs).toContainEqual(['branch_id', 'branch-1']);
    expect(lastOrderArgs?.[0]).toBe('closed_at');
    expect((lastOrderArgs?.[1] as { ascending: boolean }).ascending).toBe(false);
    expect(lastLimitArg).toBe(1);
  });
});

describe('listMovementsByTypeSince (getRunningCashBalance)', () => {
  it('queries movements by type and branch_id without gte when since is omitted', async () => {
    await listMovementsByTypeSince('branch-1', 'servicio');
    expect(lastTable).toBe('movements');
    expect(lastSelectArg).toBe('type, income, expense, payment_method, comment, expense_source');
    expect(lastEqArgs).toContainEqual(['type', 'servicio']);
    expect(lastEqArgs).toContainEqual(['branch_id', 'branch-1']);
    expect(lastGteArgs).toBeNull();
  });

  it('adds a gte created_at filter when since is provided', async () => {
    await listMovementsByTypeSince('branch-1', 'servicio', '2026-07-14T20:00:00.000Z');
    expect(lastGteArgs).toEqual(['created_at', '2026-07-14T20:00:00.000Z']);
  });
});

describe('insertCashClosing (ClosingWizard confirm step)', () => {
  it('inserts the built closing payload into cash_closings', async () => {
    const payload = {
      branch_id: 'branch-1',
      closed_by: 'user-1',
      period_start: '2026-07-14T20:00:00.000Z',
      arqueo_enabled: false,
      calculated_efectivo: 100000,
      calculated_transferencia: 0,
      calculated_pos: 0,
      calculated_total: 100000,
      counted_efectivo: null,
      counted_transferencia: null,
      counted_pos: null,
      discrepancy_efectivo: null,
      discrepancy_transferencia: null,
      discrepancy_pos: null,
      notes: null,
    };
    await insertCashClosing(payload);
    expect(lastTable).toBe('cash_closings');
    expect(lastInsertArgs).toEqual(payload);
  });
});

describe('listCashClosingsForBranch (ClosingsHistoryPage)', () => {
  it('queries cash_closings for the branch, joined with branch and profile, newest first, capped at 100', async () => {
    await listCashClosingsForBranch('branch-1');
    expect(lastTable).toBe('cash_closings');
    expect(lastSelectArg).toContain('branch:branches(name)');
    expect(lastSelectArg).toContain('closed_by_profile:profiles!cash_closings_closed_by_fkey(full_name)');
    expect(lastEqArgs).toContainEqual(['branch_id', 'branch-1']);
    expect(lastOrderArgs?.[0]).toBe('closed_at');
    expect((lastOrderArgs?.[1] as { ascending: boolean }).ascending).toBe(false);
    expect(lastLimitArg).toBe(100);
  });
});
