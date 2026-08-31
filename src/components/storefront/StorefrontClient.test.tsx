import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { StorefrontClient } from './StorefrontClient';
import type { Branch, Service } from '@/types';

const mockRpc = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ rpc: (...args: unknown[]) => mockRpc(...args) }),
}));

const mockOpen = vi.fn();

const branch: Branch = {
  id: 'b1',
  name: 'Villcan Centro',
  address: null,
  is_active: true,
  vertical: 'barbershop',
  created_at: '2026-01-01',
  slug: 'villcan-centro',
  whatsapp_number: '595981123456',
  storefront_enabled: true,
};

const services: Service[] = [
  {
    id: 's1',
    name: 'Corte clásico',
    price: 40000,
    cost: null,
    created_at: '2026-01-01',
    is_active: true,
    branch_id: 'b1',
    description: null,
    image_url: null,
    category: null,
    is_available: true,
  },
];

async function addFirstServiceAndCheckout(customer = { name: 'Juan Pérez', phone: '0981123456' }) {
  render(<StorefrontClient branch={branch} services={services} />);
  fireEvent.click(screen.getByRole('button', { name: /agregar/i }));
  fireEvent.click(screen.getByRole('button', { name: /continuar pedido/i }));
  fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: customer.name } });
  fireEvent.change(screen.getByLabelText(/teléfono/i), { target: { value: customer.phone } });
  fireEvent.click(screen.getByRole('button', { name: /confirmar pedido/i }));
}

describe('StorefrontClient (REQ: server-validated order creation + WhatsApp handoff)', () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockOpen.mockReset();
    vi.stubGlobal('open', mockOpen);
  });

  it('calls create_storefront_order and, on success, shows the WhatsApp link (never before RPC confirms)', async () => {
    mockRpc.mockResolvedValue({
      data: {
        order_id: 'o1',
        order_code: 'A1B2C3',
        total: 40000,
        whatsapp_number: '595981123456',
        whatsapp_message: 'Pedido #A1B2C3',
        items: [],
      },
      error: null,
    });

    await addFirstServiceAndCheckout();

    await waitFor(() => expect(screen.getByText(/pedido #A1B2C3 confirmado/i)).toBeTruthy());
    const link = screen.getByRole('link', { name: /enviar por whatsapp/i });
    expect(link.getAttribute('href')).toBe(
      'https://wa.me/595981123456?text=' + encodeURIComponent('Pedido #A1B2C3')
    );
  });

  it('shows rate-limit copy on VC429 and does NOT show a WhatsApp link (different error path)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: 'VC429', message: 'rate limited' } });

    await addFirstServiceAndCheckout();

    await waitFor(() =>
      expect(screen.getByText(/demasiados pedidos, esper[aá] un minuto/i)).toBeTruthy()
    );
    expect(screen.queryByRole('link', { name: /enviar por whatsapp/i })).toBeNull();
  });

  it('shows "tienda no disponible" on VC404 and does not show a WhatsApp link', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: 'VC404', message: 'not found' } });

    await addFirstServiceAndCheckout();

    await waitFor(() => expect(screen.getByText(/tienda no disponible/i)).toBeTruthy());
    expect(screen.queryByRole('link', { name: /enviar por whatsapp/i })).toBeNull();
  });
});
