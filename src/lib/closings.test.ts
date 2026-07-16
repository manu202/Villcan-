import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCalculatedBalanceSince, getLastClosing } from './closings';

type MovementsData = Record<string, { data: unknown[] | null; error: unknown }>;

let movementsByType: MovementsData = {};
let closingsRows: unknown[] = [];

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === 'movements') {
        const filters: Record<string, unknown> = {};
        const builder: Record<string, unknown> = {};
        const chain = () => builder;
        builder.select = chain;
        builder.eq = (field: string, value: unknown) => {
          filters[field] = value;
          return builder;
        };
        builder.gte = chain;
        builder.then = (
          onFulfilled: (v: unknown) => unknown,
          onRejected?: (e: unknown) => unknown
        ) => {
          const type = filters['type'] as string;
          const result = movementsByType[type] || { data: [], error: null };
          return Promise.resolve(result).then(onFulfilled, onRejected);
        };
        return builder;
      }

      if (table === 'cash_closings') {
        const builder: Record<string, unknown> = {};
        const chain = () => builder;
        builder.select = chain;
        builder.eq = chain;
        builder.order = chain;
        builder.limit = () => Promise.resolve({ data: closingsRows, error: null });
        return builder;
      }

      throw new Error(`Unexpected table in mock: ${table}`);
    },
  }),
}));

describe('getCalculatedBalanceSince (REQ-CAJA-9 formula, mirrors page.tsx balanceEfectivo scoped to a period)', () => {
  beforeEach(() => {
    movementsByType = {};
  });

  it('sums servicio income per method, adds apertura as cash, subtracts non-bank gastos from efectivo', () => {
    movementsByType = {
      servicio: {
        data: [
          { income: 50000, payment_method: 'efectivo' },
          { income: 30000, payment_method: 'transferencia' },
          { income: 20000, payment_method: 'pos' },
        ],
        error: null,
      },
      apertura: {
        data: [{ income: 100000 }],
        error: null,
      },
      gasto: {
        data: [
          { expense: 10000, comment: 'Compra insumos' },
          { expense: 5000, comment: 'Pago proveedor [Cta Bancaria]' },
        ],
        error: null,
      },
    };

    return getCalculatedBalanceSince('branch-1', '2026-07-15T00:00:00.000Z').then((result) => {
      // efectivo = servicio efectivo (50000) + apertura (100000) - gasto NOT tagged [Cta Bancaria] (10000)
      expect(result.efectivo).toBe(140000);
      expect(result.transferencia).toBe(30000);
      expect(result.pos).toBe(20000);
    });
  });

  it('with no movements in the period, all methods calculate to zero', () => {
    movementsByType = {
      servicio: { data: [], error: null },
      apertura: { data: [], error: null },
      gasto: { data: [], error: null },
    };

    return getCalculatedBalanceSince('branch-2', '2026-07-15T00:00:00.000Z').then((result) => {
      expect(result).toEqual({ efectivo: 0, transferencia: 0, pos: 0 });
    });
  });
});

describe('getLastClosing (REQ-CAJA-8 support: determines the next period_start)', () => {
  beforeEach(() => {
    closingsRows = [];
  });

  it('returns the most recent closing row for the branch when one exists', async () => {
    const row = { id: 'c1', branch_id: 'branch-1', closed_at: '2026-07-14T20:00:00.000Z' };
    closingsRows = [row];

    const result = await getLastClosing('branch-1');
    expect(result).toEqual(row);
  });

  it('returns null when the branch has no prior closings', async () => {
    closingsRows = [];

    const result = await getLastClosing('branch-1');
    expect(result).toBeNull();
  });
});
