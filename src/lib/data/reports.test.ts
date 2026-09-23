import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  listServicioMovementsForReports,
  listOrderItemsForOrders,
  listGastoMovementsForReports,
  listAperturaMovementsForReports,
  listCierreMovementsForReports,
  listServicioIncomeForPrevPeriod,
  listServicioMovementsForLiquidacion,
} from './reports';

let lastTable: string | null = null;
let lastSelectArg: string | null = null;
let lastEqArgs: [string, unknown][] = [];
let lastGteArgs: [string, unknown] | null = null;
let lastLtArgs: [string, unknown] | null = null;
let lastInArgs: [string, unknown[]] | null = null;
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
      mock.lt = (field: string, value: unknown) => {
        lastLtArgs = [field, value];
        return mock;
      };
      mock.in = (field: string, values: unknown[]) => {
        lastInArgs = [field, values];
        return mock;
      };
      // Terminal for chains that end without an explicit resolver.
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
  lastLtArgs = null;
  lastInArgs = null;
  resolvedValue = { data: [], error: null };
});

describe('listServicioMovementsForReports (ReportsPage KPIs, methods, order_ids)', () => {
  it('queries movements filtered by type=servicio, date range, without branch when omitted', async () => {
    await listServicioMovementsForReports('2026-07-01T00:00:00.000Z', '2026-07-02T00:00:00.000Z');
    expect(lastTable).toBe('movements');
    expect(lastSelectArg).toContain('amount_charged, income, expense, payment_method, created_at, branch_id, order_id');
    expect(lastSelectArg).toContain('service:services(name)');
    expect(lastEqArgs).toContainEqual(['type', 'servicio']);
    expect(lastEqArgs).not.toContainEqual(['branch_id', expect.anything()]);
    expect(lastGteArgs).toEqual(['created_at', '2026-07-01T00:00:00.000Z']);
    expect(lastLtArgs).toEqual(['created_at', '2026-07-02T00:00:00.000Z']);
  });

  it('adds a branch_id filter when branchId is provided', async () => {
    await listServicioMovementsForReports('2026-07-01T00:00:00.000Z', '2026-07-02T00:00:00.000Z', 'branch-1');
    expect(lastEqArgs).toContainEqual(['branch_id', 'branch-1']);
  });
});

describe('listOrderItemsForOrders (ReportsPage per-service breakdown)', () => {
  it('queries order_items filtered by order_id .in() the given ids', async () => {
    await listOrderItemsForOrders(['order-1', 'order-2']);
    expect(lastTable).toBe('order_items');
    expect(lastSelectArg).toBe('name_snapshot, line_total, qty');
    expect(lastInArgs).toEqual(['order_id', ['order-1', 'order-2']]);
  });
});

describe('listGastoMovementsForReports (ReportsPage expenses card)', () => {
  it('queries movements filtered by type=gasto and date range', async () => {
    await listGastoMovementsForReports('2026-07-01T00:00:00.000Z', '2026-07-02T00:00:00.000Z', 'branch-1');
    expect(lastTable).toBe('movements');
    expect(lastSelectArg).toBe('expense, income, comment');
    expect(lastEqArgs).toContainEqual(['type', 'gasto']);
    expect(lastEqArgs).toContainEqual(['branch_id', 'branch-1']);
    expect(lastGteArgs).toEqual(['created_at', '2026-07-01T00:00:00.000Z']);
    expect(lastLtArgs).toEqual(['created_at', '2026-07-02T00:00:00.000Z']);
  });
});

describe('listAperturaMovementsForReports (ReportsPage Balance Neto)', () => {
  it('queries movements filtered by type=apertura', async () => {
    await listAperturaMovementsForReports('2026-07-01T00:00:00.000Z', '2026-07-02T00:00:00.000Z');
    expect(lastTable).toBe('movements');
    expect(lastSelectArg).toBe('income');
    expect(lastEqArgs).toContainEqual(['type', 'apertura']);
  });
});

describe('listCierreMovementsForReports (ReportsPage Balance Neto)', () => {
  it('queries movements filtered by type=cierre', async () => {
    await listCierreMovementsForReports('2026-07-01T00:00:00.000Z', '2026-07-02T00:00:00.000Z');
    expect(lastTable).toBe('movements');
    expect(lastSelectArg).toBe('expense');
    expect(lastEqArgs).toContainEqual(['type', 'cierre']);
  });
});

describe('listServicioIncomeForPrevPeriod (ReportsPage period-over-period badge)', () => {
  it('queries servicio income for the previous period only', async () => {
    await listServicioIncomeForPrevPeriod('2026-06-30T00:00:00.000Z', '2026-07-01T00:00:00.000Z', 'branch-1');
    expect(lastTable).toBe('movements');
    expect(lastSelectArg).toBe('income');
    expect(lastEqArgs).toContainEqual(['type', 'servicio']);
    expect(lastEqArgs).toContainEqual(['branch_id', 'branch-1']);
    expect(lastGteArgs).toEqual(['created_at', '2026-06-30T00:00:00.000Z']);
    expect(lastLtArgs).toEqual(['created_at', '2026-07-01T00:00:00.000Z']);
  });
});

describe('listServicioMovementsForLiquidacion (LiquidacionPage per-staff breakdown)', () => {
  it('queries movements filtered by type=servicio, joined with the staff profile', async () => {
    await listServicioMovementsForLiquidacion('2026-07-01T00:00:00.000Z', '2026-07-02T00:00:00.000Z', 'branch-1');
    expect(lastTable).toBe('movements');
    expect(lastSelectArg).toContain('amount_charged, commission_pct, user_id');
    expect(lastSelectArg).toContain('user:profiles(full_name)');
    expect(lastEqArgs).toContainEqual(['type', 'servicio']);
    expect(lastEqArgs).toContainEqual(['branch_id', 'branch-1']);
  });
});
