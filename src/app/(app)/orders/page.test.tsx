import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import OrdersPage from './page';

const mockUseBranch = vi.fn();
vi.mock('@/contexts/BranchContext', () => ({
  useBranch: () => mockUseBranch(),
}));

const eqCalls: Array<[string, unknown]> = [];

function createQueryMock(resultPromise: Promise<unknown>) {
  const mock: Record<string, unknown> = {};
  const chainable = () => mock;
  mock.select = chainable;
  mock.eq = (col: string, val: unknown) => {
    eqCalls.push([col, val]);
    return mock;
  };
  mock.order = chainable;
  mock.update = () => mock;
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

describe('OrdersPage (REQ: incoming orders panel)', () => {
  beforeEach(() => {
    eqCalls.length = 0;
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'branch-1', name: 'Centro', user_role: 'admin' },
      initialized: true,
    });
  });

  it('scopes the orders query to the current branch (branch-scoped visibility)', async () => {
    queryResult = Promise.resolve({
      data: [
        {
          id: 'o1',
          order_code: 'A1B2C3',
          customer_name: 'Juan',
          status: 'pending',
          total: 40000,
          created_at: '2026-08-31T10:00:00Z',
          branch_id: 'branch-1',
        },
      ],
      error: null,
    });

    render(<OrdersPage />);

    await waitFor(() => expect(screen.getByText('A1B2C3')).toBeTruthy());
    expect(eqCalls).toContainEqual(['branch_id', 'branch-1']);
  });

  it('enables the status select for any authenticated staff (no read-only role exists anymore)', async () => {
    queryResult = Promise.resolve({
      data: [
        {
          id: 'o1',
          order_code: 'X9Y8Z7',
          customer_name: 'Ana',
          status: 'pending',
          total: 25000,
          created_at: '2026-08-31T10:00:00Z',
          branch_id: 'branch-1',
        },
      ],
      error: null,
    });

    render(<OrdersPage />);

    await waitFor(() => expect(screen.getByRole('combobox')).toBeTruthy());
    expect((screen.getByRole('combobox') as HTMLSelectElement).disabled).toBe(false);
  });
});
