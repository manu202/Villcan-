import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ServicesPage from './page';

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
  mock.eq = chainable;
  mock.order = chainable;
  mock.or = chainable;
  mock.is = chainable;
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

describe('ServicesPage error handling (REQ-ERR-1)', () => {
  beforeEach(() => {
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'branch-1', name: 'Centro' },
      initialized: true,
    });
  });

  it('renders ErrorState (not the empty state) when the Supabase query errors', async () => {
    queryResult = Promise.resolve({ data: null, error: { message: 'boom' } });

    render(<ServicesPage />);

    await waitFor(() => expect(screen.getByText('Reintentar')).toBeTruthy());
    expect(screen.queryByText('No hay servicios registrados')).toBeNull();
  });

  it('retry re-runs the query', async () => {
    queryResult = Promise.resolve({ data: null, error: { message: 'boom' } });

    render(<ServicesPage />);

    await waitFor(() => expect(screen.getByText('Reintentar')).toBeTruthy());

    queryResult = Promise.resolve({ data: [], error: null });
    screen.getByText('Reintentar').click();

    await waitFor(() => expect(screen.getByText('No hay servicios registrados')).toBeTruthy());
  });
});
