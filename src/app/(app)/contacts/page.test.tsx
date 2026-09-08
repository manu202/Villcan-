import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ContactsPage from './page';

// Sheets are integration concerns — stub them to isolate page behavior
vi.mock('@/components/ContactDetailSheet', () => ({
  ContactDetailSheet: ({
    open,
    contactId,
    onEdit,
  }: {
    open: boolean;
    contactId: string;
    onEdit: (id: string) => void;
  }) =>
    open ? (
      <div data-testid="contact-detail-sheet" data-contact-id={contactId}>
        <button onClick={() => onEdit(contactId)}>Editar</button>
      </div>
    ) : null,
}));

vi.mock('@/components/ContactFormSheet', () => ({
  ContactFormSheet: ({ open, contactId }: { open: boolean; contactId?: string }) =>
    open ? (
      <div data-testid="contact-form-sheet" data-contact-id={contactId ?? ''} />
    ) : null,
}));

vi.mock('@/components/ContactCard', () => ({
  ContactCard: ({
    contact,
    onClick,
  }: {
    contact: { id: string; full_name: string; lastVisit?: string | null };
    onClick: (id: string) => void;
  }) => (
    <li data-testid={`contact-card-${contact.id}`} onClick={() => onClick(contact.id)}>
      <span>{contact.full_name}</span>
      {contact.lastVisit ? (
        <span data-testid={`last-visit-${contact.id}`}>visitó</span>
      ) : (
        <span>Sin visitas</span>
      )}
    </li>
  ),
}));

let contactsResult: Promise<unknown>;
let movementsResult: Promise<unknown>;
let movementsQueryCallCount = 0;
let lastInContactIds: string[] = [];

function createContactsQueryMock(resultPromise: Promise<unknown>) {
  const mock: Record<string, unknown> = {};
  const chainable = () => mock;
  mock.select = chainable;
  mock.or     = chainable;
  mock.order  = chainable;
  mock.range  = () => resultPromise;
  return mock;
}

function createMovementsQueryMock(resultPromise: Promise<unknown>) {
  const mock: Record<string, unknown> = {};
  const chainable = () => mock;
  mock.select = chainable;
  mock.eq     = chainable;
  mock.in     = (_field: string, ids: string[]) => {
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

beforeEach(() => {
  movementsQueryCallCount = 0;
  lastInContactIds = [];

  contactsResult = Promise.resolve({
    data: [
      { id: 'c1', full_name: 'Ana Gomez',  ci: '111', phone: null, comment: null },
      { id: 'c2', full_name: 'Beto Diaz',  ci: null,  phone: null, comment: null },
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
});

describe('ContactsPage — carga y batch query (REQ-CRM-4)', () => {
  it('muestra los nombres de los contactos', async () => {
    render(<ContactsPage />);
    await waitFor(() => {
      expect(screen.getByText('Ana Gomez')).toBeTruthy();
      expect(screen.getByText('Beto Diaz')).toBeTruthy();
    });
  });

  it('pasa lastVisit a ContactCard para el contacto con visitas', async () => {
    render(<ContactsPage />);
    await waitFor(() => expect(screen.getByTestId('last-visit-c1')).toBeTruthy());
  });

  it('pasa lastVisit null para el contacto sin visitas → muestra "Sin visitas"', async () => {
    render(<ContactsPage />);
    await waitFor(() => expect(screen.getByText('Sin visitas')).toBeTruthy());
  });

  it('realiza UN SOLO query batch de movimientos — no N+1', async () => {
    render(<ContactsPage />);
    await waitFor(() => screen.getByText('Ana Gomez'));
    expect(movementsQueryCallCount).toBe(1);
    expect(lastInContactIds).toEqual(['c1', 'c2']);
  });
});

describe('ContactsPage — sheets (REQ-CRM-SHEET)', () => {
  it('al tap en ContactCard abre ContactDetailSheet con el contactId correcto', async () => {
    render(<ContactsPage />);
    await waitFor(() => screen.getByTestId('contact-card-c1'));
    fireEvent.click(screen.getByTestId('contact-card-c1'));
    const sheet = screen.getByTestId('contact-detail-sheet');
    expect(sheet).toBeTruthy();
    expect(sheet.getAttribute('data-contact-id')).toBe('c1');
  });

  it('el botón "+ Nuevo" abre ContactFormSheet en modo create', async () => {
    render(<ContactsPage />);
    await waitFor(() => screen.getByText('Ana Gomez'));
    fireEvent.click(screen.getByText('+ Nuevo'));
    expect(screen.getByTestId('contact-form-sheet')).toBeTruthy();
  });

  it('al editar desde el detail sheet abre ContactFormSheet con contactId', async () => {
    render(<ContactsPage />);
    await waitFor(() => screen.getByTestId('contact-card-c1'));
    fireEvent.click(screen.getByTestId('contact-card-c1'));
    fireEvent.click(screen.getByText('Editar'));
    const formSheet = screen.getByTestId('contact-form-sheet');
    expect(formSheet).toBeTruthy();
    expect(formSheet.getAttribute('data-contact-id')).toBe('c1');
  });
});
