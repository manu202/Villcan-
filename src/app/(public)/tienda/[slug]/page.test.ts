import { describe, it, expect, vi, type Mock } from 'vitest';
import { getCatalog } from './page';

// Chainable query mock: every method returns itself, and it is thenable
// so `await query` resolves to whatever `resultPromise` resolves to.
// `orMock` lets tests assert on the exact filter expression passed to `.or()`.
function createQueryMock(resultPromise: Promise<unknown>, orMock: Mock) {
  const mock: Record<string, unknown> = {};
  const chainable = () => mock;
  mock.select = chainable;
  mock.eq = chainable;
  mock.or = (...args: unknown[]) => {
    orMock(...args);
    return mock;
  };
  mock.order = chainable;
  mock.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    resultPromise.then(onFulfilled, onRejected);
  return mock;
}

let queryResult: Promise<unknown>;
let orMock: Mock;

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => createQueryMock(queryResult, orMock),
  }),
}));

describe('getCatalog (storefront public catalog)', () => {
  it('includes global services (branch_id: null) alongside branch-specific ones', async () => {
    orMock = vi.fn();
    const globalService = {
      id: 'svc-global',
      name: 'Corte clásico',
      price: 35000,
      cost: 0,
      is_active: true,
      is_available: true,
      branch_id: null,
      category: null,
      created_at: new Date().toISOString(),
    };
    const branchService = {
      id: 'svc-branch',
      name: 'Servicio de sucursal',
      price: 20000,
      cost: 0,
      is_active: true,
      is_available: true,
      branch_id: 'branch-1',
      category: null,
      created_at: new Date().toISOString(),
    };
    queryResult = Promise.resolve({ data: [globalService, branchService], error: null });

    const result = await getCatalog('branch-1');

    expect(result).toEqual([globalService, branchService]);
    expect(result.some((s) => s.branch_id === null)).toBe(true);
  });

  it('queries with an OR filter covering both the branch id and NULL (global) services', async () => {
    orMock = vi.fn();
    queryResult = Promise.resolve({ data: [], error: null });

    await getCatalog('branch-42');

    expect(orMock).toHaveBeenCalledWith('branch_id.eq.branch-42,branch_id.is.null');
  });

  it('returns an empty array when the query yields no data', async () => {
    orMock = vi.fn();
    queryResult = Promise.resolve({ data: null, error: null });

    const result = await getCatalog('branch-1');

    expect(result).toEqual([]);
  });
});
