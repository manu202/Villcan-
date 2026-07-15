import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import HomePage from './page';

const mockUseBranch = vi.fn();
vi.mock('@/contexts/BranchContext', () => ({
  useBranch: () => mockUseBranch(),
}));

// serviceMovements: [{ payment_method: 'efectivo', income: 50000 }]
// expenseMovements: [
//   { expense: 10000, comment: 'Compra insumos' },
//   { expense: 5000, comment: 'Pago proveedor [Cta Bancaria]' },
// ]
// Expected: balanceEfectivo = efectivo(50000) - gastosFromCaja(10000) = 40000
// (the 5000 Cta Bancaria gasto is excluded from balanceEfectivo)
function createQueryMock() {
  const mock: Record<string, unknown> = {};
  const chainable = () => mock;
  mock.select = chainable;
  mock.gte = chainable;
  mock.lt = chainable;

  mock.eq = (field: string, value: string) => {
    if (field === 'type') {
      if (value === 'servicio') {
        return createQueryMockForData([
          { amount_charged: 50000, income: 50000, expense: 0, payment_method: 'efectivo' },
        ]);
      }
      if (value === 'gasto') {
        return createQueryMockForData([
          { expense: 10000, comment: 'Compra insumos' },
          { expense: 5000, comment: 'Pago proveedor [Cta Bancaria]' },
        ]);
      }
    }
    return createQueryMockForData([]);
  };

  return mock;
}

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

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => createQueryMock(),
  }),
}));

describe('HomePage balanceEfectivo computation (locks existing correct behavior)', () => {
  beforeEach(() => {
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'branch-1', name: 'Centro' },
      isLoading: false,
      initialized: true,
    });
  });

  it('excludes gastos marked "Cta Bancaria" from balanceEfectivo', async () => {
    render(<HomePage />);

    // balanceEfectivo = 50000 (efectivo) - 10000 (Compra insumos, non-Cta-Bancaria gasto) = 40000
    await waitFor(() => screen.getByText('₲ 40.000'));

    expect(screen.getByText('₲ 40.000')).toBeTruthy();
  });
});
