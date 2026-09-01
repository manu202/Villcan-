import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import OrderDetailPage from './page';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'order-1' }),
}));

vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => ({ settings: { business_name: 'Villcan Centro' } }),
}));

const mockRpc = vi.fn();

const order = {
  id: 'order-1',
  branch_id: 'branch-1',
  order_code: 'A1B2C3',
  customer_name: 'Juan Pérez',
  customer_phone: '+595981123456',
  customer_email: null,
  contact_id: 'contact-1',
  note: null,
  status: 'pending',
  total: 40000,
  whatsapp_message: 'msg',
  payment_method: 'efectivo',
  delivery_type: 'pickup',
  delivery_address: null,
  created_at: '2026-08-31T10:00:00Z',
};

const orderItems = [
  { id: 'item-1', order_id: 'order-1', service_id: 's1', name_snapshot: 'Corte', unit_price: 40000, qty: 1, line_total: 40000 },
];

const contact = { id: 'contact-1', full_name: 'Juan Pérez', ci: null, phone: '+595981123456', comment: null, created_at: '2026-01-01' };

const services = [
  { id: 's1', name: 'Corte', price: 40000, cost: null, created_at: '2026-01-01', is_active: true, branch_id: 'branch-1', is_available: true },
];

function tableMock(table: string) {
  const mock: Record<string, unknown> = {};
  const chain = () => mock;
  mock.select = chain;
  mock.eq = chain;
  mock.or = chain;
  mock.order = chain;
  mock.update = () => ({ eq: async () => ({ data: null, error: null }) });
  mock.single = async () => {
    if (table === 'orders') return { data: order, error: null };
    if (table === 'contacts') return { data: contact, error: null };
    return { data: null, error: null };
  };
  mock.then = (onFulfilled: (v: unknown) => unknown) => {
    if (table === 'order_items') return Promise.resolve({ data: orderItems, error: null }).then(onFulfilled);
    if (table === 'services') return Promise.resolve({ data: services, error: null }).then(onFulfilled);
    return Promise.resolve({ data: null, error: null }).then(onFulfilled);
  };
  return mock;
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => tableMock(table),
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

describe('OrderDetailPage (REQ: order detail + full edit)', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('shows customer data, items, total, payment/delivery, and a link to the linked contact', async () => {
    render(<OrderDetailPage />);

    await waitFor(() => expect(screen.getByText('Juan Pérez')).toBeTruthy());
    expect(screen.getByText(/corte/i)).toBeTruthy();
    expect(screen.getByText(/ver contacto vinculado/i).closest('a')?.getAttribute('href')).toBe(
      '/contacts/contact-1'
    );
    expect(screen.getByText(/retiro en el local/i)).toBeTruthy();
  });

  it('enables full edit mode and calls update_order with recalculated items on save', async () => {
    mockRpc.mockResolvedValue({ data: { order_id: 'order-1', total: 80000 }, error: null });

    render(<OrderDetailPage />);
    await waitFor(() => expect(screen.getByText('Juan Pérez')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /editar/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /guardar cambios/i })).toBeTruthy());

    // The existing order item (Corte x1) is pre-loaded into the edit cart —
    // saving without touching quantities should still resubmit it so the
    // server recalculates it.
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));

    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('update_order', expect.objectContaining({
      p_order_id: 'order-1',
      p_items: expect.arrayContaining([expect.objectContaining({ service_id: 's1' })]),
    })));
  });

  it('"Notificar cliente" opens a wa.me link built from the customer phone and current status (REQ: order-notify-customer)', async () => {
    render(<OrderDetailPage />);
    await waitFor(() => expect(screen.getByText('Juan Pérez')).toBeTruthy());

    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    fireEvent.click(screen.getByRole('button', { name: /notificar cliente/i }));

    expect(openSpy).toHaveBeenCalledWith(
      'https://wa.me/595981123456?text=' +
        encodeURIComponent(
          'Hola Juan Pérez! Recibimos tu pedido #A1B2C3 en Villcan Centro y lo estamos procesando. Te avisamos apenas lo confirmemos.'
        ),
      '_blank'
    );

    openSpy.mockRestore();
  });
});
