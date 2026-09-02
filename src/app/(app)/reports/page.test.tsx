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

// serviceData total income (serviciosAmount) = 100000
// gastoData total expense (gastosTotal) = 30000
// Expected: balanceNeto = serviciosAmount - gastosTotal = 70000
function createQueryMockForData(data: unknown[]) {
  const mock: Record<string, unknown> = {};
  const chainable = () => mock;
  mock.select = chainable;
  mock.eq = chainable;
  mock.gte = chainable;
  mock.lt = chainable;
  mock.then = (onFulfilled: (v: unknown) => unknown) =>
    Promise.resolve({ data, error: null }).then(onFulfilled);
  return mock;
}

let movementsFromCalls = 0;

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => {
      // Reports page issues 2 main queries: serviceQuery (index 0), gastoQuery
      // (index 1). methodData reuses serviceData — no separate query. A 3rd call
      // (index 2+) is the prevPeriod comparison query — return empty data for it.
      const callIndex = movementsFromCalls;
      movementsFromCalls++;
      if (callIndex === 0) {
        // serviceQuery -> serviciosAmount = 100000
        return createQueryMockForData([
          { amount_charged: 100000, income: 100000, expense: 0, payment_method: 'efectivo', created_at: new Date().toISOString(), branch_id: 'branch-1', service: { name: 'Corte' } },
        ]);
      }
      if (callIndex === 1) {
        // gastoQuery -> gastosTotal = 30000 => balanceNeto = 100000 - 30000 = 70000
        return createQueryMockForData([
          { expense: 30000, income: 0, comment: 'Alquiler' },
        ]);
      }
      // prevPeriod comparison query (always fires for 'today'/'week'/'month' views)
      return createQueryMockForData([]);
    },
  }),
}));

describe('ReportsPage balanceNeto computation (locks existing correct behavior)', () => {
  beforeEach(() => {
    movementsFromCalls = 0;
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'branch-1', name: 'Centro', vertical: 'barbershop' },
      branches: [],
      initialized: true,
    });
    mockUseSettings.mockReturnValue({ settings: { staff_label: 'Barbero', services_label: 'Servicios' } });
  });

  it('computes balanceNeto = serviciosAmount - gastosTotal (100000 - 30000 = 70000)', async () => {
    render(<ReportsPage />);

    await waitFor(() => screen.getByText('₲ 70.000'));

    expect(screen.getByText('₲ 70.000')).toBeTruthy();
  });
});

describe('ReportsPage liquidación link uses configurable staff_label (generalize-verticals)', () => {
  beforeEach(() => {
    movementsFromCalls = 0;
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
    movementsFromCalls = 0;
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
