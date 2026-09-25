import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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
// listMovementsForBranch (the "Movimientos recientes" card's query) filters
// only by branch_id/date range, never by type — distinct from the
// activity queries above, which always .eq('type', ...). The mock tells
// them apart the same way: presence of a 'type' filter.
let recentMovementsRows: unknown[] = [];

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
  builder.order = chain;
  builder.limit = chain;
  builder.then = (
    onFulfilled: (v: unknown) => unknown,
    onRejected?: (e: unknown) => unknown
  ) => {
    const type = filters['type'] as string | undefined;
    const data = type !== undefined ? (movementsByType[type] || []) : recentMovementsRows;
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
    recentMovementsRows = [];
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

describe('HomePage "Movimientos recientes" card', () => {
  beforeEach(() => {
    movementsByType = { servicio: [], gasto: [], apertura: [], cierre: [] };
    closingsRows = [];
    recentMovementsRows = [];
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'branch-1', name: 'Centro' },
      isLoading: false,
      initialized: true,
    });
  });

  it('renders real rows from listMovementsForBranch with label, source, relative time and signed amount', async () => {
    recentMovementsRows = [
      {
        id: 'm1',
        type: 'servicio',
        income: 40000,
        expense: 0,
        payment_method: 'efectivo',
        comment: null,
        created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        contact: { id: 'c1', full_name: 'Juan Pérez' },
        service: { id: 's1', name: 'Corte clásico' },
      },
      {
        id: 'm2',
        type: 'gasto',
        income: 0,
        expense: 15000,
        payment_method: null,
        comment: 'Compra insumos',
        created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        contact: null,
        service: null,
      },
    ];

    render(<HomePage />);

    await waitFor(() => screen.getByText('Corte clásico'));
    expect(screen.getByText('Corte clásico')).toBeTruthy();
    expect(screen.getByText('+₲ 40.000')).toBeTruthy();
    expect(screen.getByText('Compra insumos')).toBeTruthy();
    expect(screen.getByText('−₲ 15.000')).toBeTruthy();
    expect(screen.queryByText('Sin movimientos recientes')).toBeNull();
  });

  it('shows the empty state when there are no recent movements', async () => {
    recentMovementsRows = [];
    render(<HomePage />);
    await waitFor(() => screen.getByText('Sin movimientos recientes'));
    expect(screen.getByText('Sin movimientos recientes')).toBeTruthy();
  });
});

describe('HomePage K1/K2: running-total scope note + K5: last-updated/refresh', () => {
  beforeEach(() => {
    movementsByType = {
      servicio: [{ type: 'servicio', income: 50000, expense: 0, payment_method: 'efectivo', comment: null }],
      gasto: [],
      apertura: [],
      cierre: [],
    };
    closingsRows = [];
    recentMovementsRows = [];
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'branch-1', name: 'Centro' },
      isLoading: false,
      initialized: true,
    });
  });

  it('K1/K2: shows a note that the headline balance is a running total, independent of the period tabs', async () => {
    render(<HomePage />);
    await waitFor(() => expect(screen.getAllByText('₲ 50.000').length).toBeGreaterThan(0));
    expect(screen.getByText(/total acumulado, no varía por período/i)).toBeTruthy();
  });

  it('K1/K2: labels the period tabs as scoping only the breakdown below, once expanded', async () => {
    render(<HomePage />);
    await waitFor(() => expect(screen.getAllByText('₲ 50.000').length).toBeGreaterThan(0));

    fireEvent.click(screen.getByLabelText('Ver desglose'));

    expect(screen.getByText('Detalle del período')).toBeTruthy();
  });

  it('K5: shows a last-updated label and a refresh button once loaded', async () => {
    render(<HomePage />);
    await waitFor(() => screen.getByText(/actualizado/i));
    expect(screen.getByLabelText('Actualizar')).toBeTruthy();
  });

  it('K5: clicking refresh re-fetches the running balance', async () => {
    const { container } = render(<HomePage />);
    await waitFor(() => expect(screen.getAllByText('₲ 50.000').length).toBeGreaterThan(0));

    // Change the underlying data, as if new movements landed server-side,
    // then trigger a manual refresh -- the page has no poll of its own.
    movementsByType = {
      ...movementsByType,
      servicio: [{ type: 'servicio', income: 90000, expense: 0, payment_method: 'efectivo', comment: null }],
    };

    fireEvent.click(screen.getByLabelText('Actualizar'));

    await waitFor(() => expect(container.querySelector('.balance-value')?.textContent).toContain('90.000'));
  });

  it('K3: a negative running balance renders with the same negative color as movement rows', async () => {
    movementsByType = {
      servicio: [],
      gasto: [{ type: 'gasto', income: 0, expense: 50000, payment_method: null, comment: 'Alquiler' }],
      apertura: [],
      cierre: [],
    };
    const { container } = render(<HomePage />);

    await waitFor(() => expect(container.querySelector('.balance-value')?.textContent).toContain('50.000'));
    expect(container.querySelector('.balance-value')?.className).toContain('balance-value--negative');
  });
});
