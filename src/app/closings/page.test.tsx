import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ClosingsHistoryPage from './page';

const mockUseBranch = vi.fn();
vi.mock('@/contexts/BranchContext', () => ({
  useBranch: () => mockUseBranch(),
}));

function createQueryMock(resultPromise: Promise<unknown>) {
  const mock: Record<string, unknown> = {};
  const chainable = () => mock;
  mock.select = chainable;
  mock.eq = chainable;
  mock.order = chainable;
  mock.limit = chainable;
  mock.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    resultPromise.then(onFulfilled, onRejected);
  return mock;
}

let queryResult: Promise<unknown>;
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => createQueryMock(queryResult),
  }),
}));

describe('ClosingsHistoryPage (REQ-CAJA-8)', () => {
  beforeEach(() => {
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'branch-1', name: 'Centro' },
      initialized: true,
    });
  });

  it('renders an empty state when the branch has no closings', async () => {
    queryResult = Promise.resolve({ data: [], error: null });

    render(<ClosingsHistoryPage />);

    await waitFor(() => expect(screen.getByText(/sin cierres/i)).toBeTruthy());
  });

  it('renders date, branch, closed_by, and calculated/counted/discrepancy per method for each closing', async () => {
    queryResult = Promise.resolve({
      data: [
        {
          id: 'c1',
          branch_id: 'branch-1',
          closed_by: 'user-1',
          closed_at: '2026-07-15T20:00:00.000Z',
          arqueo_enabled: true,
          calculated_efectivo: 100000,
          calculated_transferencia: 50000,
          calculated_pos: 20000,
          calculated_total: 170000,
          counted_efectivo: 105000,
          counted_transferencia: 50000,
          counted_pos: 18000,
          discrepancy_efectivo: 5000,
          discrepancy_transferencia: 0,
          discrepancy_pos: -2000,
          branch: { name: 'Centro' },
          closed_by_profile: { full_name: 'Juan Perez' },
        },
      ],
      error: null,
    });

    render(<ClosingsHistoryPage />);

    await waitFor(() => expect(screen.getByText('Centro')).toBeTruthy());
    expect(screen.getByText('Juan Perez')).toBeTruthy();
    expect(screen.getByText(/₲\s*100.000/)).toBeTruthy(); // calculated efectivo
    expect(screen.getByText(/₲\s*105.000/)).toBeTruthy(); // counted efectivo
    expect(screen.getByText(/\+₲\s*5.000/)).toBeTruthy(); // discrepancy efectivo
  });

  it('shows a calculated-only row (no counted columns) for a toggle-OFF closing', async () => {
    queryResult = Promise.resolve({
      data: [
        {
          id: 'c2',
          branch_id: 'branch-1',
          closed_by: 'user-1',
          closed_at: '2026-07-14T20:00:00.000Z',
          arqueo_enabled: false,
          calculated_efectivo: 30000,
          calculated_transferencia: 0,
          calculated_pos: 0,
          calculated_total: 30000,
          counted_efectivo: null,
          counted_transferencia: null,
          counted_pos: null,
          discrepancy_efectivo: null,
          discrepancy_transferencia: null,
          discrepancy_pos: null,
          branch: { name: 'Centro' },
          closed_by_profile: { full_name: 'Juan Perez' },
        },
      ],
      error: null,
    });

    render(<ClosingsHistoryPage />);

    await waitFor(() => expect(screen.getByText(/₲\s*30.000/)).toBeTruthy());
    expect(screen.getByText(/sin arqueo/i)).toBeTruthy();
  });
});
