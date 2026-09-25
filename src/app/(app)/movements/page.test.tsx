import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MovementsPage from './page';

let mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

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

const eqCalls: Array<[string, unknown]> = [];

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
  mock.eq = (col: string, val: unknown) => {
    eqCalls.push([col, val]);
    return mock;
  };
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
    eqCalls.length = 0;
    mockSearchParams = new URLSearchParams();
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

describe('MovementsPage M-8: drill-down from Reports via query params', () => {
  beforeEach(() => {
    fromCalls = 0;
    deferreds = [createDeferred(), createDeferred()];
    eqCalls.length = 0;
    mockSearchParams = new URLSearchParams();
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'branch-1', name: 'Centro' },
      initialized: true,
    });
  });

  it('defaults to "Hoy" and no method filter when no query params are present', async () => {
    render(<MovementsPage />);
    await waitFor(() => expect(fromCalls).toBe(1));
    deferreds[0].resolve({ data: [], error: null });
    await waitFor(() => expect(screen.getByText('Hoy').className).toContain('active'));

    expect(eqCalls.some(([col]) => col === 'payment_method')).toBe(false);
    expect(screen.queryByText(/filtrado por método/i)).toBeNull();
  });

  it('seeds the date filter and method filter from ?range=&method=, and shows the removable chip', async () => {
    mockSearchParams = new URLSearchParams('range=week&method=transferencia');
    render(<MovementsPage />);
    await waitFor(() => expect(fromCalls).toBe(1));
    deferreds[0].resolve({ data: [], error: null });

    await waitFor(() => expect(screen.getByText('Semana').className).toContain('active'));
    expect(eqCalls).toContainEqual(['payment_method', 'transferencia']);
    expect(screen.getByText(/filtrado por método: transferencia/i)).toBeTruthy();
  });

  it('ignores an invalid ?method= value', async () => {
    mockSearchParams = new URLSearchParams('method=bitcoin');
    render(<MovementsPage />);
    await waitFor(() => expect(fromCalls).toBe(1));
    deferreds[0].resolve({ data: [], error: null });

    await waitFor(() => expect(screen.getByText('Hoy')).toBeTruthy());
    expect(eqCalls.some(([col]) => col === 'payment_method')).toBe(false);
    expect(screen.queryByText(/filtrado por método/i)).toBeNull();
  });

  it('clicking the chip\'s remove button clears the method filter and re-fetches unscoped', async () => {
    mockSearchParams = new URLSearchParams('method=pos');
    render(<MovementsPage />);
    await waitFor(() => expect(fromCalls).toBe(1));
    deferreds[0].resolve({ data: [], error: null });
    await waitFor(() => expect(screen.getByText(/filtrado por método: pos/i)).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /quitar filtro de método/i }));

    await waitFor(() => expect(fromCalls).toBe(2));
    deferreds[1].resolve({ data: [], error: null });

    await waitFor(() => expect(screen.queryByText(/filtrado por método/i)).toBeNull());
  });

  it('re-syncs the filter and method from a new ?range=&method= when the page is already mounted (pre-merge review finding)', async () => {
    // Simulates clicking a fresh Reports drill-down link while /movements is
    // already mounted in the router cache -- Next.js updates useSearchParams()
    // without unmounting the component, so state seeded only via a lazy
    // useState initializer would go stale. filter/methodFilter must re-derive
    // from searchParams on every change, not just at first mount.
    const { rerender } = render(<MovementsPage />);
    await waitFor(() => expect(fromCalls).toBe(1));
    deferreds[0].resolve({ data: [], error: null });
    await waitFor(() => expect(screen.getByText('Hoy').className).toContain('active'));

    mockSearchParams = new URLSearchParams('range=week&method=transferencia');
    rerender(<MovementsPage />);

    await waitFor(() => expect(screen.getByText('Semana').className).toContain('active'));
    await waitFor(() => expect(fromCalls).toBe(2));
    deferreds[1].resolve({ data: [], error: null });
    await waitFor(() => expect(eqCalls).toContainEqual(['payment_method', 'transferencia']));
    expect(screen.getByText(/filtrado por método: transferencia/i)).toBeTruthy();
  });
});
