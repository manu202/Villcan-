import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import LiquidacionPage from './page';

const mockUseBranch = vi.fn();
vi.mock('@/contexts/BranchContext', () => ({
  useBranch: () => mockUseBranch(),
}));

const mockUseSettings = vi.fn();
vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => mockUseSettings(),
}));

let movementsData: unknown[] = [];

function createQueryMock(data: unknown[]) {
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

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => createQueryMock(movementsData),
  }),
}));

describe('LiquidacionPage commission column visibility (REQ-PROFIT-5)', () => {
  beforeEach(() => {
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'branch-1', name: 'Centro', vertical: 'barbershop' },
      branches: [{ id: 'branch-1', user_role: 'admin' }],
      initialized: true,
    });
    movementsData = [
      { amount_charged: 100000, commission_pct: 15, user_id: 'u1', user: { full_name: 'Ana' } },
    ];
  });

  it('shows the commission amount per barber when commissions_enabled is true', async () => {
    mockUseSettings.mockReturnValue({
      settings: { commissions_enabled: true, default_commission_pct: 15, staff_label: 'Barbero' },
    });

    render(<LiquidacionPage />);

    await waitFor(() => screen.getByText('Ana'));

    // facturado appears twice: per-barber row + Total row (both 100000, only one barber)
    expect(screen.getAllByText('₲ 100.000')).toHaveLength(2);
    // commission = 100000 * 15 / 100 = 15000, also appears in both rows
    expect(screen.getAllByText('₲ 15.000')).toHaveLength(2);
  });

  it('hides the commission amount entirely when commissions_enabled is false', async () => {
    mockUseSettings.mockReturnValue({
      settings: { commissions_enabled: false, default_commission_pct: 0, staff_label: 'Barbero' },
    });

    render(<LiquidacionPage />);

    await waitFor(() => screen.getByText('Ana'));

    expect(screen.getAllByText('₲ 100.000')).toHaveLength(2);
    expect(screen.queryByText('₲ 15.000')).toBeNull();
  });
});

describe('LiquidacionPage titles use configurable staff_label (generalize-verticals)', () => {
  beforeEach(() => {
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'branch-1', name: 'Centro', vertical: 'barbershop' },
      branches: [{ id: 'branch-1', user_role: 'admin' }],
      initialized: true,
    });
    movementsData = [
      { amount_charged: 100000, commission_pct: 15, user_id: 'u1', user: { full_name: 'Ana' } },
    ];
  });

  it('shows the configured staff_label in the page title and card title instead of hardcoded "barbero"', async () => {
    mockUseSettings.mockReturnValue({
      settings: { commissions_enabled: false, default_commission_pct: 0, staff_label: 'Mozo' },
    });

    render(<LiquidacionPage />);

    await waitFor(() => screen.getByText('Ana'));

    expect(screen.getByRole('heading', { name: 'Liquidación por mozo' })).toBeTruthy();
    expect(screen.getByText('Por mozo')).toBeTruthy();
  });

  it('shows a different configured staff_label without hardcoding "Mozo" either', async () => {
    mockUseSettings.mockReturnValue({
      settings: { commissions_enabled: false, default_commission_pct: 0, staff_label: 'Operador' },
    });

    render(<LiquidacionPage />);

    await waitFor(() => screen.getByText('Ana'));

    expect(screen.getByRole('heading', { name: 'Liquidación por operador' })).toBeTruthy();
    expect(screen.getByText('Por operador')).toBeTruthy();
  });
});
