import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ContactDetailPage from './page';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'contact-1' }),
  useRouter: () => ({ push: vi.fn() }),
}));

let contactResult: Promise<unknown>;
let movementsResult: Promise<unknown>;

function createQueryMock(resultPromise: Promise<unknown>) {
  const mock: Record<string, unknown> = {};
  const chainable = () => mock;
  mock.select = chainable;
  mock.eq = chainable;
  mock.order = chainable;
  mock.single = () => resultPromise;
  mock.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    resultPromise.then(onFulfilled, onRejected);
  return mock;
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) =>
      table === 'contacts' ? createQueryMock(contactResult) : createQueryMock(movementsResult),
  }),
}));

const baseContact = {
  id: 'contact-1',
  full_name: 'Ana Gomez',
  ci: '1234567',
  phone: '0981123456',
  comment: null,
  created_at: '2026-01-01T00:00:00.000Z',
};

describe('ContactDetailPage (REQ-CRM-3)', () => {
  it('shows the frequent-client badge and last-visit date for a frequent contact', async () => {
    contactResult = Promise.resolve({ data: baseContact, error: null });
    movementsResult = Promise.resolve({
      data: [
        { id: 'm1', type: 'servicio', amount_charged: 35000, created_at: '2026-08-25T10:00:00.000Z', service: { name: 'Corte' } },
        { id: 'm2', type: 'servicio', amount_charged: 35000, created_at: '2026-08-10T10:00:00.000Z', service: { name: 'Corte' } },
        { id: 'm3', type: 'servicio', amount_charged: 35000, created_at: '2026-08-01T10:00:00.000Z', service: { name: 'Corte' } },
      ],
      error: null,
    });

    render(<ContactDetailPage />);

    await waitFor(() => expect(screen.getByText('Cliente frecuente')).toBeTruthy());
    expect(screen.getAllByText('25/08/2026').length).toBeGreaterThan(0);
  });

  it('shows "Sin visitas" and no frequent badge for a contact with zero movements', async () => {
    contactResult = Promise.resolve({ data: baseContact, error: null });
    movementsResult = Promise.resolve({ data: [], error: null });

    render(<ContactDetailPage />);

    await waitFor(() => expect(screen.getByText('Sin visitas')).toBeTruthy());
    expect(screen.queryByText('Cliente frecuente')).toBeNull();
  });
});
