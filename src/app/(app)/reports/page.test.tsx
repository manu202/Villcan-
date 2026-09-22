import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ReportsPage from './page';

const mockUseBranch = vi.fn();
vi.mock('@/contexts/BranchContext', () => ({
  useBranch: () => mockUseBranch(),
}));

const mockUseSettings = vi.fn();
vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => mockUseSettings(),
}));

// Movement rows per type, settable per test. `servicio` covers BOTH the
// main period query and the prevPeriod comparison query — the component
// issues the main `servicio` query first, then (later) the prevPeriod one,
// so the Nth call of a given type gets the Nth entry of that type's array
// here (falls back to an empty result once exhausted).
type MovementsByType = Record<string, unknown[][]>;
let movementsByType: MovementsByType = {};
let callCountByType: Record<string, number> = {};

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => {
      // `type` is set via the first `.eq('type', X)` call the component
      // makes on this builder — every query on this page filters by type
      // before anything else, so we can build the mock lazily per builder.
      const builder: Record<string, unknown> = {};
      let resolvedType: string | null = null;
      const chainable = () => builder;
      builder.select = chainable;
      builder.eq = (field: string, value: unknown) => {
        if (field === 'type') resolvedType = value as string;
        return builder;
      };
      builder.gte = chainable;
      builder.lt = chainable;
      builder.then = (onFulfilled: (v: unknown) => unknown) => {
        const type = resolvedType || 'servicio';
        const callsSoFar = callCountByType[type] || 0;
        const dataForType = movementsByType[type] || [];
        const data = dataForType[callsSoFar] ?? [];
        callCountByType[type] = callsSoFar + 1;
        return Promise.resolve({ data, error: null }).then(onFulfilled);
      };
      return builder;
    },
  }),
}));

describe('ReportsPage balanceNeto computation (uses the shared computeCashBalance, M-3)', () => {
  beforeEach(() => {
    callCountByType = {};
    movementsByType = {
      // main servicio query (1st call) = 100000 efectivo; prevPeriod query
      // (2nd call of type servicio) = empty
      servicio: [
        [{ amount_charged: 100000, income: 100000, expense: 0, payment_method: 'efectivo', created_at: new Date().toISOString(), branch_id: 'branch-1', service: { name: 'Corte' } }],
        [],
      ],
      gasto: [[{ expense: 30000, income: 0, comment: 'Alquiler' }]],
      apertura: [[]],
      cierre: [[]],
    };
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'branch-1', name: 'Centro', vertical: 'barbershop' },
      branches: [],
      initialized: true,
    });
    mockUseSettings.mockReturnValue({ settings: { staff_label: 'Barbero', services_label: 'Servicios' } });
  });

  it('computes balanceNeto = global cash balance (100000 - 30000 = 70000) when there is no apertura/cierre/bank-split', async () => {
    render(<ReportsPage />);

    await waitFor(() => screen.getByText('₲ 70.000'));

    expect(screen.getByText('₲ 70.000')).toBeTruthy();
  });

  it('M-3 regression: apertura, cierre and a bank-tagged gasto change the correct answer away from the old serviciosAmount - gastosTotal formula', async () => {
    // Old (wrong) formula would have shown: serviciosAmount(100000) -
    // gastosTotal(30000 + 20000 bank-tagged) = 50000 — ignoring apertura and
    // cierre entirely. The correct answer, per computeCashBalance:
    //   efectivo = apertura(200000) + servicioEfectivo(100000)
    //              - cashGasto(30000) - cierre(50000) = 220000
    //   global   = efectivo(220000) + transferencia(0) + pos(0)
    //              - bankGasto(20000) = 200000
    movementsByType = {
      servicio: [
        [{ amount_charged: 100000, income: 100000, expense: 0, payment_method: 'efectivo', created_at: new Date().toISOString(), branch_id: 'branch-1', service: { name: 'Corte' } }],
        [],
      ],
      gasto: [[
        { expense: 30000, income: 0, comment: 'Insumos' },
        { expense: 20000, income: 0, comment: 'Alquiler [Cta Bancaria]' },
      ]],
      apertura: [[{ income: 200000 }]],
      cierre: [[{ expense: 50000 }]],
    };

    render(<ReportsPage />);

    await waitFor(() => screen.getByText('₲ 200.000'));

    expect(screen.getByText('₲ 200.000')).toBeTruthy();
    // the old, wrong 50000 must NOT be what's displayed
    expect(screen.queryByText('₲ 50.000')).toBeNull();
  });
});

describe('ReportsPage liquidación link uses configurable staff_label (generalize-verticals)', () => {
  beforeEach(() => {
    callCountByType = {};
    movementsByType = {
      servicio: [
        [{ amount_charged: 100000, income: 100000, expense: 0, payment_method: 'efectivo', created_at: new Date().toISOString(), branch_id: 'branch-1', service: { name: 'Corte' } }],
        [],
      ],
      gasto: [[{ expense: 30000, income: 0, comment: 'Alquiler' }]],
      apertura: [[]],
      cierre: [[]],
    };
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'branch-1', name: 'Centro', vertical: 'barbershop' },
      branches: [],
      initialized: true,
    });
  });

  it('shows the configured staff_label in the liquidación link instead of hardcoded "barbero"', async () => {
    mockUseSettings.mockReturnValue({ settings: { staff_label: 'Mozo' } });

    render(<ReportsPage />);

    await waitFor(() => screen.getByText('₲ 70.000'));

    expect(screen.getByText('Liquidación por mozo ›')).toBeTruthy();
  });

  it('shows a different configured staff_label without hardcoding "Mozo" either', async () => {
    mockUseSettings.mockReturnValue({ settings: { staff_label: 'Operador' } });

    render(<ReportsPage />);

    await waitFor(() => screen.getByText('₲ 70.000'));

    expect(screen.getByText('Liquidación por operador ›')).toBeTruthy();
  });
});

describe('ReportsPage KPI/card labels use configurable services_label instead of hardcoded "Servicios"', () => {
  beforeEach(() => {
    callCountByType = {};
    movementsByType = {
      servicio: [
        [{ amount_charged: 100000, income: 100000, expense: 0, payment_method: 'efectivo', created_at: new Date().toISOString(), branch_id: 'branch-1', service: { name: 'Corte' } }],
        [],
      ],
      gasto: [[{ expense: 30000, income: 0, comment: 'Alquiler' }]],
      apertura: [[]],
      cierre: [[]],
    };
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'branch-1', name: 'Centro', vertical: 'barbershop' },
      branches: [],
      initialized: true,
    });
  });

  it('uses services_label in the "Total {label}" KPI and the breakdown card title', async () => {
    mockUseSettings.mockReturnValue({ settings: { staff_label: 'Barbero', services_label: 'Menú' } });

    render(<ReportsPage />);

    await waitFor(() => screen.getByText('₲ 70.000'));

    expect(screen.getByText('Total Menú')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Menú' })).toBeTruthy();
    expect(screen.queryByText('Total Servicios')).toBeNull();
  });

  it('falls back to the default label "Servicios" when settings say so', async () => {
    mockUseSettings.mockReturnValue({ settings: { staff_label: 'Barbero', services_label: 'Servicios' } });

    render(<ReportsPage />);

    await waitFor(() => screen.getByText('₲ 70.000'));

    expect(screen.getByText('Total Servicios')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Servicios' })).toBeTruthy();
  });
});
