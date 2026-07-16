import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ContactsPage from './page';

let contactsResult: Promise<unknown>;
let movementsResult: Promise<unknown>;
let movementsQueryCallCount = 0;
let lastInContactIds: string[] = [];

function createContactsQueryMock(resultPromise: Promise<unknown>) {
  const mock: Record<string, unknown> = {};
  const chainable = () => mock;
  mock.select = chainable;
  mock.or = chainable;
  mock.order = chainable;
  mock.range = () => resultPromise;
  return mock;
}

function createMovementsQueryMock(resultPromise: Promise<unknown>) {
  const mock: Record<string, unknown> = {};
  const chainable = () => mock;
  mock.select = chainable;
  mock.eq = chainable;
  mock.in = (_field: string, ids: string[]) => {
    movementsQueryCallCount += 1;
    lastInContactIds = ids;
    return resultPromise;
  };
  return mock;
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) =>
      table === 'contacts'
        ? createContactsQueryMock(contactsResult)
        : createMovementsQueryMock(movementsResult),
  }),
}));

describe('ContactsPage (REQ-CRM-4)', () => {
  beforeEach(() => {
    movementsQueryCallCount = 0;
    lastInContactIds = [];
  });

  it('shows last-visit date or "Sin visitas" per contact using a single batched movements query', async () => {
    contactsResult = Promise.resolve({
      data: [
        { id: 'c1', full_name: 'Ana Gomez', ci: '111', phone: null, comment: null },
        { id: 'c2', full_name: 'Beto Diaz', ci: null, phone: null, comment: null },
      ],
      error: null,
    });
    movementsResult = Promise.resolve({
      data: [
        { contact_id: 'c1', created_at: '2026-07-01T10:00:00.000Z' },
        { contact_id: 'c1', created_at: '2026-07-10T10:00:00.000Z' },
      ],
      error: null,
    });

    render(<ContactsPage />);

    await waitFor(() => expect(screen.getByText('Ana Gomez')).toBeTruthy());
    await waitFor(() => expect(screen.getByText(/Última visita: 10\/07\/2026/)).toBeTruthy());
    expect(screen.getByText('Sin visitas')).toBeTruthy();

    expect(movementsQueryCallCount).toBe(1);
    expect(lastInContactIds).toEqual(['c1', 'c2']);
  });
});
