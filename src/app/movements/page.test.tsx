import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MovementsPage from './page';

// Deferred helper to control promise resolution order manually.
function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const mockUseBranch = vi.fn();
vi.mock('@/contexts/BranchContext', () => ({
  useBranch: () => mockUseBranch(),
}));

// Chainable query mock: every method returns itself, and it is thenable
// so `await query` resolves to whatever `resultPromise` resolves to.
function createQueryMock(resultPromise: Promise<unknown>) {
  const mock: Record<string, unknown> = {};
  const chainable = () => mock;
  mock.select = chainable;
  mock.gte = chainable;
  mock.lt = chainable;
  mock.order = chainable;
  mock.limit = chainable;
  mock.eq = chainable;
  mock.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    resultPromise.then(onFulfilled, onRejected);
  return mock;
}

let fromCalls = 0;
let deferreds: ReturnType<typeof createDeferred>[] = [];

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => {
      const deferred = deferreds[fromCalls];
      fromCalls++;
      return createQueryMock(deferred.promise);
    },
  }),
}));

describe('MovementsPage race condition guard', () => {
  beforeEach(() => {
    fromCalls = 0;
    deferreds = [createDeferred(), createDeferred()];
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'branch-1', name: 'Centro' },
      initialized: true,
    });
  });

  it('ignores a stale (first) request that resolves after a fresher (second) request', async () => {
    render(<MovementsPage />);

    // Wait until the first (today) fetch has been kicked off.
    await waitFor(() => expect(fromCalls).toBe(1));

    // Change filter -> triggers second effect run / second fetch, BEFORE the
    // first one resolves.
    fireEvent.click(screen.getByText('Semana'));

    await waitFor(() => expect(fromCalls).toBe(2));

    const staleData = [
      {
        id: 'stale-1',
        type: 'gasto',
        amount_charged: null,
        income: 0,
        expense: 1000,
        payment_method: null,
        comment: 'STALE',
        created_at: new Date().toISOString(),
      },
    ];
    const freshData = [
      {
        id: 'fresh-1',
        type: 'gasto',
        amount_charged: null,
        income: 0,
        expense: 2000,
        payment_method: null,
        comment: 'FRESH',
        created_at: new Date().toISOString(),
      },
    ];

    // Resolve the SECOND (fresh) request first, then the FIRST (stale) one.
    deferreds[1].resolve({ data: freshData, error: null });
    await waitFor(() => screen.getByText('FRESH'));

    deferreds[0].resolve({ data: staleData, error: null });

    // Give the stale resolution a chance to (wrongly) overwrite state.
    await new Promise((r) => setTimeout(r, 20));

    // The stale response must NOT have overwritten the fresh one.
    expect(screen.queryByText('STALE')).toBeNull();
    expect(screen.getByText('FRESH')).toBeTruthy();
  });
});
