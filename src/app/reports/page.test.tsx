import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ReportsPage from './page';

const mockUseBranch = vi.fn();
vi.mock('@/contexts/BranchContext', () => ({
  useBranch: () => mockUseBranch(),
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
      // Reports page issues 3 movements queries per load: serviceQuery,
      // methodQuery, gastoQuery (in that exact order, see src/app/reports/page.tsx).
      const callIndex = movementsFromCalls % 3;
      movementsFromCalls++;
      if (callIndex === 0) {
        // serviceQuery -> serviciosAmount = 100000
        return createQueryMockForData([
          { amount_charged: 100000, income: 100000, expense: 0, payment_method: 'efectivo', created_at: new Date().toISOString(), branch_id: 'branch-1', service: { name: 'Corte' } },
        ]);
      }
      if (callIndex === 1) {
        // methodQuery
        return createQueryMockForData([
          { amount_charged: 100000, income: 100000, expense: 0, payment_method: 'efectivo' },
        ]);
      }
      // gastoQuery -> gastosTotal = 30000
      return createQueryMockForData([
        { expense: 30000, income: 0, comment: 'Alquiler' },
      ]);
    },
  }),
}));

describe('ReportsPage balanceNeto computation (locks existing correct behavior)', () => {
  beforeEach(() => {
    movementsFromCalls = 0;
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'branch-1', name: 'Centro' },
      branches: [],
      initialized: true,
    });
  });

  it('computes balanceNeto = serviciosAmount - gastosTotal (100000 - 30000 = 70000)', async () => {
    render(<ReportsPage />);

    await waitFor(() => screen.getByText('₲ 70.000'));

    expect(screen.getByText('₲ 70.000')).toBeTruthy();
  });
});
