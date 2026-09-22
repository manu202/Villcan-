import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { OrderDetailSheet } from './OrderDetailSheet';

vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => ({ settings: { business_name: 'Villcan Centro' } }),
}));

const mockShowToast = vi.fn();
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

const mockRpc = vi.fn();

// Mutable result for handleStatusChange's .update().eq().select().single() chain.
let mockUpdateResult: { data: unknown; error: unknown } = {
  data: { id: 'order-1' },
  error: null,
};

const ORDER_BASE = {
  id: 'order-1',
  branch_id: 'branch-1',
  order_code: 'A1B2C3',
  customer_name: 'Juan Pérez',
  customer_phone: '0981123456',
  customer_email: null,
  contact_id: null,
  note: null,
  status: 'pending',
  total: 40000,
  whatsapp_message: 'msg',
  payment_method: 'efectivo',
  delivery_type: 'pickup',
  delivery_address: null,
  delivery_fee: null,
  delivery_location: null,
  created_at: '2026-08-31T10:00:00Z',
  order_items: [
    { id: 'item-1', order_id: 'order-1', service_id: 's1', name_snapshot: 'Corte', unit_price: 40000, qty: 1, line_total: 40000 },
  ],
};

let currentOrder: typeof ORDER_BASE = ORDER_BASE;
// The first .from('orders').select().eq().single() call is the initial
// load; handlePaymentCompleted's refetch is every call after that — kept
// separate so a test can make the refetch fail without affecting the
// initial render.
let singleCallCount = 0;
let mockRefetchResult: { data: unknown; error: unknown } = { data: null, error: null };

function tableMock() {
  const mock: Record<string, unknown> = {};
  const chain = () => mock;
  mock.select = chain;
  mock.eq = chain;
  // handleStatusChange: .update({ status }).eq('id', ...).select('id').single()
  mock.update = () => ({
    eq: () => ({
      select: () => ({
        single: async () => mockUpdateResult,
      }),
    }),
  });
  mock.single = async () => {
    singleCallCount++;
    if (singleCallCount === 1) return { data: currentOrder, error: null };
    return mockRefetchResult;
  };
  return mock;
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => tableMock(),
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

describe('OrderDetailSheet (REQ: quick order detail panel)', () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockShowToast.mockReset();
    mockUpdateResult = { data: { id: 'order-1' }, error: null };
    currentOrder = ORDER_BASE;
    singleCallCount = 0;
    mockRefetchResult = { data: { ...ORDER_BASE, status: 'completed' }, error: null };
  });

  it('shows customer, items, and total', async () => {
    render(<OrderDetailSheet orderId="order-1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Juan Pérez')).toBeTruthy());
    expect(screen.getByText(/1× Corte/)).toBeTruthy();
  });

  // SW-O2 (TDD RED->GREEN): total shown must include delivery fee.
  it('para pedidos delivery, el total incluye el costo de envío (SW-O2)', async () => {
    currentOrder = { ...ORDER_BASE, delivery_type: 'delivery', delivery_fee: 15000, total: 40000 };
    render(<OrderDetailSheet orderId="order-1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Juan Pérez')).toBeTruthy());
    // 40000 + 15000 = 55000
    expect(screen.getByText(/55,000|55\.000/)).toBeTruthy();
  });

  // SW-O1 (TDD RED->GREEN): selecting "completed" must open the atomic
  // OrderPaymentSheet flow instead of writing status directly.
  it('seleccionar "Completado" abre OrderPaymentSheet en vez de actualizar directo (SW-O1)', async () => {
    render(<OrderDetailSheet orderId="order-1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Juan Pérez')).toBeTruthy());

    const statusSelect = screen.getByLabelText('Estado del pedido');
    fireEvent.change(statusSelect, { target: { value: 'completed' } });

    await waitFor(() => expect(screen.getByText('Confirmar pago')).toBeTruthy());
    // The status was NOT written directly.
    expect(statusSelect).toHaveProperty('value', 'pending');
  });

  // SW-O6 (TDD RED->GREEN): status write result must be checked before
  // mutating local state, and errors must be surfaced.
  it('handleStatusChange: en éxito actualiza el estado sin mostrar toast', async () => {
    mockUpdateResult = { data: { id: 'order-1' }, error: null };
    render(<OrderDetailSheet orderId="order-1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Juan Pérez')).toBeTruthy());

    const statusSelect = screen.getByLabelText('Estado del pedido');
    fireEvent.change(statusSelect, { target: { value: 'confirmed' } });

    await waitFor(() => expect(statusSelect).toHaveProperty('value', 'confirmed'));
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('handleStatusChange: en error de RLS muestra toast y NO cambia el estado local', async () => {
    mockUpdateResult = { data: null, error: { code: 'PGRST116' } };
    render(<OrderDetailSheet orderId="order-1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Juan Pérez')).toBeTruthy());

    const statusSelect = screen.getByLabelText('Estado del pedido');
    fireEvent.change(statusSelect, { target: { value: 'confirmed' } });

    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith('Error al cambiar el estado del pedido', 'error')
    );
    expect(statusSelect).toHaveProperty('value', 'pending');
  });

  // SW-O7 (new UI, no prior behavior to be RED against): cancelling requires confirmation.
  it('seleccionar "Cancelado" pide confirmación antes de escribir (SW-O7)', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<OrderDetailSheet orderId="order-1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Juan Pérez')).toBeTruthy());

    const statusSelect = screen.getByLabelText('Estado del pedido');
    fireEvent.change(statusSelect, { target: { value: 'cancelled' } });

    expect(confirmSpy).toHaveBeenCalled();
    // Declined confirmation -> no write, state unchanged.
    expect(statusSelect).toHaveProperty('value', 'pending');
    confirmSpy.mockRestore();
  });

  it('seleccionar "Cancelado" y confirmar sí escribe el nuevo estado', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<OrderDetailSheet orderId="order-1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Juan Pérez')).toBeTruthy());

    const statusSelect = screen.getByLabelText('Estado del pedido');
    fireEvent.change(statusSelect, { target: { value: 'cancelled' } });

    await waitFor(() => expect(statusSelect).toHaveProperty('value', 'cancelled'));
    confirmSpy.mockRestore();
  });

  // Reviewer finding R3-orderdetail-payment-refetch-error (RDD, 2026-09-22):
  // handlePaymentCompleted discarded a refetch error silently, leaving the
  // sheet showing the stale pre-completion status with no feedback even
  // though the payment itself already succeeded.
  it('si el refetch post-pago falla, avisa por toast en vez de quedarse en silencio', async () => {
    mockRpc.mockResolvedValue({ data: { order_id: 'order-1' }, error: null });
    mockRefetchResult = { data: null, error: { message: 'network error' } };

    render(<OrderDetailSheet orderId="order-1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Juan Pérez')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('Estado del pedido'), { target: { value: 'completed' } });
    await waitFor(() => expect(screen.getByText('Confirmar pago')).toBeTruthy());

    fireEvent.change(screen.getByPlaceholderText('Monto recibido'), { target: { value: '40000' } });
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));

    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith(
        'El pago se registró, pero no se pudo actualizar la vista. Recargá la página.',
        'error'
      )
    );
  });

  it('"Notificar cliente" abre un link de wa.me', async () => {
    render(<OrderDetailSheet orderId="order-1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Juan Pérez')).toBeTruthy());

    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    fireEvent.click(screen.getByRole('button', { name: /notificar cliente/i }));
    expect(openSpy).toHaveBeenCalled();
    openSpy.mockRestore();
  });
});
