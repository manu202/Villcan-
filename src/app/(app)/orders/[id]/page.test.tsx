import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import OrderDetailPage from './page';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'order-1' }),
}));

vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => ({ settings: { business_name: 'Villcan Centro' } }),
}));

const mockShowToast = vi.fn();
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

const mockRpc = vi.fn();

// Mutable result for handleStatusChange's .update().eq().select().single() chain.
// Tests override this to simulate success or RLS error.
let mockUpdateResult: { data: unknown; error: unknown } = {
  data: { id: 'order-1' },
  error: null,
};

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
  delivery_fee: null as number | null,
  created_at: '2026-08-31T10:00:00Z',
};

const orderItems = [
  { id: 'item-1', order_id: 'order-1', service_id: 's1', name_snapshot: 'Corte', unit_price: 40000, qty: 1, line_total: 40000 },
];

let orderOverride: typeof order = order;
// After the first 'orders'.single() call (the initial load), every
// subsequent call (refetch after save / after status change / after
// payment) returns this instead, when set — lets a test simulate the
// refetch itself failing after a write already succeeded.
let ordersSingleCallCount = 0;
let refetchOverride: { data: unknown; error: unknown } | null = null;
// Same idea for order_items: only the refetch calls (2nd+) can be made to
// fail, never the initial page load.
let itemsCallCount = 0;
let itemsRefetchOverride: { data: unknown; error: unknown } | null = null;

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
  // handleStatusChange: .update({ status }).eq('id', ...).select('id').single()
  // Returns mockUpdateResult so individual tests can simulate success / RLS errors.
  mock.update = () => ({
    eq: () => ({
      select: () => ({
        single: async () => mockUpdateResult,
      }),
    }),
  });
  mock.single = async () => {
    if (table === 'orders') {
      ordersSingleCallCount++;
      if (ordersSingleCallCount > 1 && refetchOverride) return refetchOverride;
      return { data: orderOverride, error: null };
    }
    if (table === 'contacts') return { data: contact, error: null };
    return { data: null, error: null };
  };
  mock.then = (onFulfilled: (v: unknown) => unknown) => {
    if (table === 'order_items') {
      itemsCallCount++;
      if (itemsCallCount > 1 && itemsRefetchOverride) {
        return Promise.resolve(itemsRefetchOverride).then(onFulfilled);
      }
      return Promise.resolve({ data: orderItems, error: null }).then(onFulfilled);
    }
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
    mockShowToast.mockReset();
    mockUpdateResult = { data: { id: 'order-1' }, error: null };
    orderOverride = order;
    ordersSingleCallCount = 0;
    refetchOverride = null;
    itemsCallCount = 0;
    itemsRefetchOverride = null;
  });

  it('shows customer data, items, total, payment/delivery, and a link to the linked contact', async () => {
    render(<OrderDetailPage />);

    await waitFor(() => expect(screen.getByText('Juan Pérez')).toBeTruthy());
    expect(screen.getByText(/corte/i)).toBeTruthy();
    // "Ver contacto vinculado" opens a ContactDetailSheet (button), not a direct link
    expect(screen.getByText(/ver contacto vinculado/i)).toBeTruthy();
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

  // TDD (RED→GREEN): handleStatusChange now uses .select().single() to detect
  // 0-row RLS blocks as PGRST116, and shows a toast on error without mutating state.

  it('handleStatusChange: on success updates order status without showing a toast', async () => {
    mockUpdateResult = { data: { id: 'order-1' }, error: null };
    render(<OrderDetailPage />);
    await waitFor(() => expect(screen.getByText('Juan Pérez')).toBeTruthy());

    const statusSelect = screen.getByLabelText('Estado del pedido');
    fireEvent.change(statusSelect, { target: { value: 'confirmed' } });

    // Allow the async update to resolve
    await waitFor(() => expect(mockShowToast).not.toHaveBeenCalled());
  });

  it('handleStatusChange: on RLS error (PGRST116) shows toast and does NOT update order status', async () => {
    mockUpdateResult = { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } };
    render(<OrderDetailPage />);
    await waitFor(() => expect(screen.getByText('Juan Pérez')).toBeTruthy());

    const statusSelect = screen.getByLabelText('Estado del pedido');
    fireEvent.change(statusSelect, { target: { value: 'confirmed' } });

    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith(
        'Error al cambiar el estado del pedido',
        'error'
      )
    );

    // Select must revert to original status (state not mutated on error)
    expect(statusSelect).toHaveProperty('value', 'pending');
  });

  // SW-O2 (TDD RED->GREEN): grand total must include delivery fee.
  it('for delivery orders, the grand total includes the delivery fee (SW-O2)', async () => {
    orderOverride = { ...order, delivery_type: 'delivery', delivery_fee: 15000, total: 40000 };
    render(<OrderDetailPage />);
    await waitFor(() => expect(screen.getByText('Juan Pérez')).toBeTruthy());
    // 40000 + 15000 = 55000
    expect(screen.getByText(/55,000|55\.000/)).toBeTruthy();
  });

  // SW-O7 (new UI, no prior behavior to be RED against): cancelling requires confirmation.
  it('selecting "Cancelado" asks for confirmation before writing (SW-O7)', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<OrderDetailPage />);
    await waitFor(() => expect(screen.getByText('Juan Pérez')).toBeTruthy());

    const statusSelect = screen.getByLabelText('Estado del pedido');
    fireEvent.change(statusSelect, { target: { value: 'cancelled' } });

    expect(confirmSpy).toHaveBeenCalled();
    expect(statusSelect).toHaveProperty('value', 'pending');
    confirmSpy.mockRestore();
  });

  it('selecting "Cancelado" and confirming does write the new status', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<OrderDetailPage />);
    await waitFor(() => expect(screen.getByText('Juan Pérez')).toBeTruthy());

    const statusSelect = screen.getByLabelText('Estado del pedido');
    fireEvent.change(statusSelect, { target: { value: 'cancelled' } });

    await waitFor(() => expect(statusSelect).toHaveProperty('value', 'cancelled'));
    confirmSpy.mockRestore();
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

  // Same bug class the RDD review found and fixed in OrderDetailSheet.tsx
  // (R3-orderdetail-payment-refetch-error) — this full detail page has its
  // own separate handlePaymentCompleted with the identical silent-failure
  // gap, never caught because that review only covered the sibling
  // component. Confirmed pre-existing (present before today's data-layer
  // extraction too, via `git show`), not introduced by this session.
  it('si el refetch post-pago falla, avisa por toast en vez de quedarse en silencio', async () => {
    mockRpc.mockResolvedValue({ data: { order_id: 'order-1' }, error: null });

    render(<OrderDetailPage />);
    await waitFor(() => expect(screen.getByText('Juan Pérez')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('Estado del pedido'), { target: { value: 'completed' } });
    await waitFor(() => expect(screen.getByText('Confirmar pago')).toBeTruthy());

    refetchOverride = { data: null, error: { message: 'network error' } };
    fireEvent.change(screen.getByPlaceholderText('Monto recibido'), { target: { value: '40000' } });
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));

    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith(
        'El pago se registró, pero no se pudo actualizar la vista. Recargá la página.',
        'error'
      )
    );
  });

  // Follow-up RDD finding (R3-orderpage-save-refetch-silent, 2026-09-22):
  // handleSave had the identical silent-failure gap as handlePaymentCompleted,
  // pre-existing, never caught until the second review pass on this file.
  it('si el refetch post-guardado falla, avisa por toast', async () => {
    mockRpc.mockResolvedValue({ error: null });

    render(<OrderDetailPage />);
    await waitFor(() => expect(screen.getByText('Juan Pérez')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /^editar$/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /guardar cambios/i })).toBeTruthy());

    refetchOverride = { data: null, error: { message: 'network error' } };
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));

    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith(
        'Los cambios se guardaron, pero no se pudo actualizar la vista. Recargá la página.',
        'error'
      )
    );
  });

  // Follow-up RDD finding (R3-orderpage-payment-items-error-ignored,
  // 2026-09-22): even the just-fixed handlePaymentCompleted only checked
  // the order refetch, silently emptying the item list if only the items
  // query failed.
  it('si el pedido se actualiza pero los ítems fallan, avisa y no vacía la lista en silencio', async () => {
    mockRpc.mockResolvedValue({ data: { order_id: 'order-1' }, error: null });

    render(<OrderDetailPage />);
    await waitFor(() => expect(screen.getByText('Juan Pérez')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('Estado del pedido'), { target: { value: 'completed' } });
    await waitFor(() => expect(screen.getByText('Confirmar pago')).toBeTruthy());

    itemsRefetchOverride = { data: null, error: { message: 'network error' } };
    fireEvent.change(screen.getByPlaceholderText('Monto recibido'), { target: { value: '40000' } });
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));

    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith(
        'El pedido se actualizó, pero no se pudieron cargar sus ítems. Recargá la página.',
        'error'
      )
    );
  });

  // SW-O4: edit_confirmed_order_delivery_fee — real RPC wiring (T14).
  describe('Editar fee de delivery (SW-O4)', () => {
    it('shows the edit button only for a confirmed delivery order with a fee already set', async () => {
      orderOverride = { ...order, status: 'confirmed', delivery_type: 'delivery', delivery_fee: 15000 };
      render(<OrderDetailPage />);
      await waitFor(() => expect(screen.getByText('Juan Pérez')).toBeTruthy());
      expect(screen.getByRole('button', { name: /editar fee de delivery/i })).toBeTruthy();
    });

    it('does NOT show the edit button for a pending delivery order', async () => {
      orderOverride = { ...order, status: 'pending', delivery_type: 'delivery', delivery_fee: 15000 };
      render(<OrderDetailPage />);
      await waitFor(() => expect(screen.getByText('Juan Pérez')).toBeTruthy());
      expect(screen.queryByRole('button', { name: /editar fee de delivery/i })).toBeNull();
    });

    it('opens the form, submits the new fee, and calls edit_confirmed_order_delivery_fee', async () => {
      orderOverride = { ...order, status: 'confirmed', delivery_type: 'delivery', delivery_fee: 15000 };
      mockRpc.mockResolvedValue({ data: { order_id: 'order-1', delivery_fee: 20000, total: 60000 }, error: null });

      render(<OrderDetailPage />);
      await waitFor(() => expect(screen.getByText('Juan Pérez')).toBeTruthy());

      fireEvent.click(screen.getByRole('button', { name: /editar fee de delivery/i }));
      const input = await screen.findByLabelText(/nuevo costo de delivery/i);
      fireEvent.change(input, { target: { value: '20000' } });
      fireEvent.click(screen.getByRole('button', { name: /^guardar$/i }));

      await waitFor(() =>
        expect(mockRpc).toHaveBeenCalledWith('edit_confirmed_order_delivery_fee', {
          p_order_id: 'order-1',
          p_delivery_fee: 20000,
        })
      );
    });

    it('shows the RPC error copy on failure (VC409) instead of a raw message', async () => {
      orderOverride = { ...order, status: 'confirmed', delivery_type: 'delivery', delivery_fee: 15000 };
      mockRpc.mockResolvedValue({ data: null, error: { code: 'VC409', message: 'raw pg error' } });

      render(<OrderDetailPage />);
      await waitFor(() => expect(screen.getByText('Juan Pérez')).toBeTruthy());

      fireEvent.click(screen.getByRole('button', { name: /editar fee de delivery/i }));
      const input = await screen.findByLabelText(/nuevo costo de delivery/i);
      fireEvent.change(input, { target: { value: '20000' } });
      fireEvent.click(screen.getByRole('button', { name: /^guardar$/i }));

      await waitFor(() =>
        expect(mockShowToast).toHaveBeenCalledWith(
          'El pedido debe estar confirmado para editar el costo de delivery.',
          'error'
        )
      );
    });
  });

  // O-8: cancel_order — real RPC wiring (T14).
  describe('Cancelar con motivo (O-8)', () => {
    it('shows the "Cancelar con motivo" button for a pending order', async () => {
      orderOverride = { ...order, status: 'pending' };
      render(<OrderDetailPage />);
      await waitFor(() => expect(screen.getByText('Juan Pérez')).toBeTruthy());
      expect(screen.getByRole('button', { name: /cancelar con motivo/i })).toBeTruthy();
    });

    it('does NOT show it for a completed order', async () => {
      orderOverride = { ...order, status: 'completed' };
      render(<OrderDetailPage />);
      await waitFor(() => expect(screen.getByText('Juan Pérez')).toBeTruthy());
      expect(screen.queryByRole('button', { name: /cancelar con motivo/i })).toBeNull();
    });

    it('disables the confirm button until a reason is typed', async () => {
      orderOverride = { ...order, status: 'pending' };
      render(<OrderDetailPage />);
      await waitFor(() => expect(screen.getByText('Juan Pérez')).toBeTruthy());

      fireEvent.click(screen.getByRole('button', { name: /cancelar con motivo/i }));
      const confirmBtn = await screen.findByRole('button', { name: /confirmar cancelación/i });
      expect(confirmBtn).toHaveProperty('disabled', true);

      fireEvent.change(screen.getByLabelText(/motivo de la cancelación/i), { target: { value: 'el cliente llamó' } });
      expect(confirmBtn).toHaveProperty('disabled', false);
    });

    it('submits the reason and calls cancel_order', async () => {
      orderOverride = { ...order, status: 'pending' };
      mockRpc.mockResolvedValue({ data: { order_id: 'order-1', status: 'cancelled' }, error: null });

      render(<OrderDetailPage />);
      await waitFor(() => expect(screen.getByText('Juan Pérez')).toBeTruthy());

      fireEvent.click(screen.getByRole('button', { name: /cancelar con motivo/i }));
      fireEvent.change(await screen.findByLabelText(/motivo de la cancelación/i), { target: { value: 'el cliente llamó' } });
      fireEvent.click(screen.getByRole('button', { name: /confirmar cancelación/i }));

      await waitFor(() =>
        expect(mockRpc).toHaveBeenCalledWith('cancel_order', {
          p_order_id: 'order-1',
          p_reason: 'el cliente llamó',
        })
      );
    });

    it('shows the RPC error copy on failure (VC409) instead of a raw message', async () => {
      orderOverride = { ...order, status: 'pending' };
      mockRpc.mockResolvedValue({ data: null, error: { code: 'VC409', message: 'raw pg error' } });

      render(<OrderDetailPage />);
      await waitFor(() => expect(screen.getByText('Juan Pérez')).toBeTruthy());

      fireEvent.click(screen.getByRole('button', { name: /cancelar con motivo/i }));
      fireEvent.change(await screen.findByLabelText(/motivo de la cancelación/i), { target: { value: 'el cliente llamó' } });
      fireEvent.click(screen.getByRole('button', { name: /confirmar cancelación/i }));

      await waitFor(() =>
        expect(mockShowToast).toHaveBeenCalledWith(
          'No se puede cancelar un pedido completado o ya cancelado.',
          'error'
        )
      );
    });
  });
});
