import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import HomePage from './page';

const mockUseBranch = vi.fn();
vi.mock('@/contexts/BranchContext', () => ({
  useBranch: () => mockUseBranch(),
}));

// Shared fixture: movements by type, used both for the dashboard's own
// activity queries (servicio/gasto, date-scoped) and for
// getRunningCashBalance's queries (apertura/servicio/gasto/cierre,
// scoped since last closing or all-time).
type MovementsByType = Record<string, unknown[]>;

let movementsByType: MovementsByType = {};
let closingsRows: unknown[] = [];

function createMovementsBuilder() {
  const filters: Record<string, unknown> = {};
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.select = chain;
  builder.eq = (field: string, value: unknown) => {
    filters[field] = value;
    return builder;
  };
  builder.gte = chain;
  builder.lt = chain;
  builder.then = (
    onFulfilled: (v: unknown) => unknown,
    onRejected?: (e: unknown) => unknown
  ) => {
    const type = filters['type'] as string;
    const data = movementsByType[type] || [];
    return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected);
  };
  return builder;
}

function createClosingsBuilder() {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.select = chain;
  builder.eq = chain;
  builder.order = chain;
  builder.limit = () => Promise.resolve({ data: closingsRows, error: null });
  return builder;
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === 'movements') return createMovementsBuilder();
      if (table === 'cash_closings') return createClosingsBuilder();
      throw new Error(`Unexpected table in mock: ${table}`);
    },
  }),
}));

describe('HomePage running balance + period activity (REQ-DASHBOARD-1..6)', () => {
  beforeEach(() => {
    movementsByType = {};
    closingsRows = [];
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'branch-1', name: 'Centro' },
      isLoading: false,
      initialized: true,
    });
  });

  it('zero-apertura/cierre regression: matches pre-fix balanceEfectivo exactly (REQ-DASHBOARD-6)', async () => {
    movementsByType = {
      servicio: [
        { type: 'servicio', income: 50000, expense: 0, payment_method: 'efectivo', comment: null },
      ],
      gasto: [
        { type: 'gasto', income: 0, expense: 10000, payment_method: null, comment: 'Compra insumos' },
        { type: 'gasto', income: 0, expense: 5000, payment_method: null, comment: 'Pago proveedor [Cta Bancaria]' },
      ],
      apertura: [],
      cierre: [],
    };

    render(<HomePage />);

    // Pre-fix: balanceEfectivo = efectivo(50000) - gastosFromCaja(10000) = 40000
    await waitFor(() => screen.getByText('₲ 40.000'));
    expect(screen.getByText('₲ 40.000')).toBeTruthy();
  });

  it('includes a week-old apertura in the running balance regardless of the period toggle (REQ-DASHBOARD-1)', async () => {
    movementsByType = {
      servicio: [],
      gasto: [],
      apertura: [{ type: 'apertura', income: 1000000, expense: 0, payment_method: null, comment: null }],
      cierre: [],
    };
    closingsRows = []; // no closing ever -> all-time running balance

    render(<HomePage />);

    // balanceGlobal = balanceEfectivo = 1000000 (no other movements)
    await waitFor(() => screen.getAllByText('₲ 1.000.000').length > 0);
    expect(screen.getAllByText('₲ 1.000.000').length).toBeGreaterThan(0);
  });
});
