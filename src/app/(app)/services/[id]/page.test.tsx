import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ServiceDetailPage from './page';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'svc-1' }),
  useRouter: () => ({ push: vi.fn() }),
}));

let serviceData: { id: string; name: string; price: number; cost: number | null; is_active: boolean; created_at: string; branch_id: string | null };

function createQueryMock(resultPromise: Promise<unknown>) {
  const mock: Record<string, unknown> = {};
  const chainable = () => mock;
  mock.select = chainable;
  mock.eq = chainable;
  mock.order = chainable;
  mock.limit = chainable;
  mock.single = () => resultPromise;
  mock.then = (onFulfilled: (v: unknown) => unknown) =>
    Promise.resolve({ data: [], error: null }).then(onFulfilled);
  return mock;
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === 'services') {
        return createQueryMock(Promise.resolve({ data: serviceData, error: null }));
      }
      // movements: no sales history needed for this test
      return createQueryMock(Promise.resolve({ data: [], error: null }));
    },
  }),
}));

describe('ServiceDetailPage margin display (REQ-PROFIT-4)', () => {
  beforeEach(() => {
    serviceData = {
      id: 'svc-1',
      name: 'Corte',
      price: 50000,
      cost: 20000,
      is_active: true,
      created_at: new Date().toISOString(),
      branch_id: null,
    };
  });

  it('shows Costo and Margen (price - cost) when the service has a tracked cost', async () => {
    render(<ServiceDetailPage />);

    await waitFor(() => screen.getByText('Margen'));

    expect(screen.getByText('₲ 20.000')).toBeTruthy(); // Costo
    expect(screen.getByText('₲ 30.000')).toBeTruthy(); // Margen = 50000 - 20000
  });

  it('hides the margin section entirely when cost is 0 (no cost tracked)', async () => {
    serviceData = { ...serviceData, cost: 0 };

    render(<ServiceDetailPage />);

    await waitFor(() => screen.getByText('Corte'));

    expect(screen.queryByText('Margen')).toBeNull();
  });
});
