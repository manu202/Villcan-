import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ContactDetailSheet } from './ContactDetailSheet';

vi.mock('@/lib/utils', () => ({
  formatGuaranies: (n: number) => `₲ ${n}`,
  formatDate: (_d: string) => '01/09/2026',
  formatRelativeDate: (_d: string) => 'hace 2 días',
}));

vi.mock('@/lib/contactAggregates', () => ({
  getContactVisitAggregate: () => ({ lastVisit: '2026-09-06T10:00:00Z', isFrequent: false }),
}));

const mockContactSingle      = vi.fn();
const mockMovementsResult    = vi.fn();
const mockAllMovementsResult = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === 'contacts') {
        return { select: () => ({ eq: () => ({ single: mockContactSingle }) }) };
      }
      if (table === 'movements') {
        return {
          // Capped "recent movements" list query: select(...).eq().order().limit()
          // Full-aggregate query (no join, no limit): select('amount_charged').eq()
          select: (cols: string) => {
            if (typeof cols === 'string' && cols.includes('service')) {
              return {
                eq: () => ({
                  order: () => ({
                    limit: mockMovementsResult,
                  }),
                }),
              };
            }
            return { eq: mockAllMovementsResult };
          },
        };
      }
      return {};
    },
  }),
}));

const BASE_CONTACT = {
  id: 'c1',
  full_name: 'Maria García',
  ci: '9876543',
  phone: '0991000111',
  comment: null,
  created_at: '2026-01-01T00:00:00Z',
};

const MOVEMENTS = [
  { id: 'm1', type: 'servicio', amount_charged: 50000, income: 50000, expense: 0, created_at: '2026-09-06T10:00:00Z', service: { name: 'Corte' } },
  { id: 'm2', type: 'servicio', amount_charged: 30000, income: 30000, expense: 0, created_at: '2026-09-01T10:00:00Z', service: { name: 'Barba' } },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockContactSingle.mockResolvedValue({ data: BASE_CONTACT, error: null });
  mockMovementsResult.mockResolvedValue({ data: MOVEMENTS, error: null });
  mockAllMovementsResult.mockResolvedValue({ data: MOVEMENTS, error: null });
});

describe('ContactDetailSheet — carga', () => {
  it('muestra estado de carga mientras resuelve', () => {
    mockContactSingle.mockReturnValue(new Promise(() => {}));
    render(
      <ContactDetailSheet contactId="c1" open={true} onOpenChange={vi.fn()} onEdit={vi.fn()} />
    );
    expect(screen.getByTestId('cds-loading')).toBeTruthy();
  });
});

describe('ContactDetailSheet — datos del contacto', () => {
  it('muestra el nombre del contacto', async () => {
    render(
      <ContactDetailSheet contactId="c1" open={true} onOpenChange={vi.fn()} onEdit={vi.fn()} />
    );
    await waitFor(() => expect(screen.getByText('Maria García')).toBeTruthy());
  });

  it('muestra el CI del contacto', async () => {
    render(
      <ContactDetailSheet contactId="c1" open={true} onOpenChange={vi.fn()} onEdit={vi.fn()} />
    );
    await waitFor(() => expect(screen.getByText('CI 9876543')).toBeTruthy());
  });

  it('muestra el teléfono del contacto', async () => {
    render(
      <ContactDetailSheet contactId="c1" open={true} onOpenChange={vi.fn()} onEdit={vi.fn()} />
    );
    await waitFor(() => expect(screen.getByText('0991000111')).toBeTruthy());
  });
});

describe('ContactDetailSheet — stats', () => {
  it('muestra la cantidad de visitas', async () => {
    render(
      <ContactDetailSheet contactId="c1" open={true} onOpenChange={vi.fn()} onEdit={vi.fn()} />
    );
    await waitFor(() => expect(screen.getByText('2')).toBeTruthy());
  });

  it('muestra el total gastado formateado', async () => {
    render(
      <ContactDetailSheet contactId="c1" open={true} onOpenChange={vi.fn()} onEdit={vi.fn()} />
    );
    await waitFor(() => expect(screen.getByText('₲ 80000')).toBeTruthy());
  });

  it('calcula visitas y total gastado sobre TODOS los movimientos, no solo los últimos 5 mostrados (C-1)', async () => {
    // Recent-movements list stays capped at 5 (legit UX choice for the panel)...
    const CAPPED_LIST = [
      { id: 'm1', type: 'servicio', amount_charged: 50000, income: 50000, expense: 0, created_at: '2026-09-07T10:00:00Z', service: { name: 'Corte' } },
      { id: 'm2', type: 'servicio', amount_charged: 30000, income: 30000, expense: 0, created_at: '2026-09-06T10:00:00Z', service: { name: 'Barba' } },
      { id: 'm3', type: 'servicio', amount_charged: 20000, income: 20000, expense: 0, created_at: '2026-09-05T10:00:00Z', service: { name: 'Corte' } },
      { id: 'm4', type: 'servicio', amount_charged: 20000, income: 20000, expense: 0, created_at: '2026-09-04T10:00:00Z', service: { name: 'Corte' } },
      { id: 'm5', type: 'servicio', amount_charged: 20000, income: 20000, expense: 0, created_at: '2026-09-03T10:00:00Z', service: { name: 'Corte' } },
    ];
    // ...but the contact actually has 7 movements in total (2 older than the capped list).
    const FULL_SET = [
      ...CAPPED_LIST,
      { id: 'm6', type: 'servicio', amount_charged: 20000, income: 20000, expense: 0, created_at: '2026-09-02T10:00:00Z' },
      { id: 'm7', type: 'servicio', amount_charged: 20000, income: 20000, expense: 0, created_at: '2026-09-01T10:00:00Z' },
    ];

    mockMovementsResult.mockResolvedValue({ data: CAPPED_LIST, error: null });
    mockAllMovementsResult.mockResolvedValue({ data: FULL_SET, error: null });

    render(
      <ContactDetailSheet contactId="c1" open={true} onOpenChange={vi.fn()} onEdit={vi.fn()} />
    );

    // Full total: 50000 + 30000 + 20000*5 = 180000 (NOT 140000, the capped-list total).
    await waitFor(() => expect(screen.getByText('₲ 180000')).toBeTruthy());
    // Full visit count: 7 (NOT 5, the capped-list length).
    await waitFor(() => expect(screen.getByText('7')).toBeTruthy());
  });
});

describe('ContactDetailSheet — historial', () => {
  it('muestra los movimientos del contacto', async () => {
    render(
      <ContactDetailSheet contactId="c1" open={true} onOpenChange={vi.fn()} onEdit={vi.fn()} />
    );
    await waitFor(() => {
      expect(screen.getByText('Corte')).toBeTruthy();
      expect(screen.getByText('Barba')).toBeTruthy();
    });
  });
});

describe('ContactDetailSheet — acciones', () => {
  it('botón Editar llama onEdit con el contactId correcto', async () => {
    const onEdit = vi.fn();
    render(
      <ContactDetailSheet contactId="c1" open={true} onOpenChange={vi.fn()} onEdit={onEdit} />
    );
    await waitFor(() => screen.getByText('Maria García'));
    fireEvent.click(screen.getByText('Editar'));
    expect(onEdit).toHaveBeenCalledWith('c1');
  });
});
