import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen } from '@testing-library/react';
import StorefrontPage from './page';
import type { Branch } from '@/types';

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ rpc: vi.fn() }),
}));

// Chainable query mock reused for both the branch lookup (.maybeSingle) and
// the catalog lookup (.or/.eq/.order, thenable).
function createQueryMock(resultPromise: Promise<unknown>) {
  const mock: Record<string, unknown> = {};
  const chainable = () => mock;
  mock.select = chainable;
  mock.eq = chainable;
  mock.or = chainable;
  mock.order = chainable;
  mock.maybeSingle = () => resultPromise;
  mock.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    resultPromise.then(onFulfilled, onRejected);
  return mock;
}

let branchResult: Promise<unknown>;
let catalogResult: Promise<unknown>;

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) =>
      table === 'branches' ? createQueryMock(branchResult) : createQueryMock(catalogResult),
  }),
}));

function branchFixture(vertical: Branch['vertical']): Branch {
  return {
    id: 'b1',
    name: 'Test Branch',
    address: null,
    is_active: true,
    vertical,
    created_at: '2026-01-01',
    slug: 'test-branch',
    whatsapp_number: '595981123456',
    storefront_enabled: true,
  };
}

async function renderPage(vertical: Branch['vertical']) {
  branchResult = Promise.resolve({ data: branchFixture(vertical), error: null });
  catalogResult = Promise.resolve({ data: [], error: null });
  const jsx = await StorefrontPage({ params: Promise.resolve({ slug: 'test-branch' }) });
  render(jsx);
}

describe('StorefrontPage vertical routing (REQ: template chosen by branch.vertical)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the Gastronomy template for vertical=gastronomy', async () => {
    await renderPage('gastronomy');
    expect(document.querySelector('.gt')).toBeTruthy();
  });

  it('renders the Retail template for vertical=retail', async () => {
    await renderPage('retail');
    expect(document.querySelector('.retail-shell')).toBeTruthy();
  });

  it('renders the Services template for vertical=barbershop', async () => {
    await renderPage('barbershop');
    expect(document.querySelector('.svc-shell')).toBeTruthy();
  });

  it('falls back to the Services template for vertical=generic', async () => {
    await renderPage('generic');
    expect(document.querySelector('.svc-shell')).toBeTruthy();
  });

  it('shows "tienda no disponible" when the branch is not found', async () => {
    branchResult = Promise.resolve({ data: null, error: null });
    const jsx = await StorefrontPage({ params: Promise.resolve({ slug: 'missing' }) });
    render(jsx);
    expect(screen.getByText(/tienda no disponible/i)).toBeTruthy();
  });
});
