import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import OrdersPage from './page';

let mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

const mockUseBranch = vi.fn();
vi.mock('@/contexts/BranchContext', () => ({
  useBranch: () => mockUseBranch(),
}));

vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => ({ settings: { business_name: 'Villcan Centro' } }),
}));

const mockShowToast = vi.fn();
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

const eqCalls: Array<[string, unknown]> = [];
const gteCalls: Array<[string, unknown]> = [];
const ltCalls: Array<[string, unknown]> = [];

// Mutable result for handleStatusChange's .update().eq().select().single() chain.
let mockUpdateResult: { data: unknown; error: unknown } = {
  data: { id: 'o1' },
  error: null,
};

function createQueryMock(resultPromise: Promise<unknown>) {
  const mock: Record<string, unknown> = {};
  const chainable = () => mock;
  mock.select = chainable;
  mock.eq = (col: string, val: unknown) => {
    eqCalls.push([col, val]);
    return mock;
  };
  mock.gte = (col: string, val: unknown) => {
    gteCalls.push([col, val]);
    return mock;
  };
  mock.lt = (col: string, val: unknown) => {
    ltCalls.push([col, val]);
    return mock;
  };
  mock.order = chainable;
  // handleStatusChange: .update(...).eq('id', ...).select('id').single()
  mock.update = () => mock;
  mock.single = () => Promise.resolve(mockUpdateResult);
  mock.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    resultPromise.then(onFulfilled, onRejected);
  return mock;
}

let queryResult: Promise<unknown>;

// confirm_order_delivery_fee RPC result (2026-09-22 fix: confirming a
// delivery order with a fee must go through this RPC, not a raw
// .update({status, delivery_fee}) on the orders table).
let mockRpcResult: { data: unknown; error: unknown } = { data: {}, error: null };
const rpcCalls: Array<[string, unknown]> = [];

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => createQueryMock(queryResult),
    rpc: (fn: string, params: unknown) => {
      rpcCalls.push([fn, params]);
      return Promise.resolve(mockRpcResult);
    },
  }),
}));

const ORDER_BASE = {
  id: 'o1',
  order_code: 'A1B2C3',
  customer_name: 'Juan',
  customer_phone: '0981123456',
  status: 'pending',
  total: 40000,
  created_at: '2026-08-31T10:00:00Z',
  branch_id: 'branch-1',
  order_items: [],
};

describe('OrdersPage (REQ: incoming orders panel)', () => {
  beforeEach(() => {
    eqCalls.length = 0;
    gteCalls.length = 0;
    ltCalls.length = 0;
    rpcCalls.length = 0;
    mockShowToast.mockReset();
    mockUpdateResult = { data: { id: 'o1' }, error: null };
    mockRpcResult = { data: {}, error: null };
    mockSearchParams = new URLSearchParams();
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'branch-1', name: 'Centro', user_role: 'admin' },
      initialized: true,
    });
  });

  describe('M-8: date-range drill-down from Reports', () => {
    it('defaults to no date scoping (all orders) when no ?range= param is present', async () => {
      queryResult = Promise.resolve({ data: [ORDER_BASE], error: null });
      render(<OrdersPage />);
      await waitFor(() => expect(screen.getByText('#A1B2C3')).toBeTruthy());
      expect(gteCalls).toEqual([]);
      expect(ltCalls).toEqual([]);
      expect(screen.getByRole('button', { name: 'Todo' }).className).toContain('active');
    });

    it('scopes the query to the week range when ?range=week is present, and marks that tab active', async () => {
      mockSearchParams = new URLSearchParams('range=week');
      queryResult = Promise.resolve({ data: [ORDER_BASE], error: null });
      render(<OrdersPage />);
      await waitFor(() => expect(screen.getByText('#A1B2C3')).toBeTruthy());
      expect(gteCalls).toContainEqual(['created_at', expect.any(String)]);
      expect(ltCalls).toContainEqual(['created_at', expect.any(String)]);
      expect(screen.getByRole('button', { name: 'Semana' }).className).toContain('active');
    });

    it('ignores an invalid ?range= value and falls back to unscoped', async () => {
      mockSearchParams = new URLSearchParams('range=bogus');
      queryResult = Promise.resolve({ data: [ORDER_BASE], error: null });
      render(<OrdersPage />);
      await waitFor(() => expect(screen.getByText('#A1B2C3')).toBeTruthy());
      expect(gteCalls).toEqual([]);
      expect(ltCalls).toEqual([]);
    });

    it('clicking a date-filter tab re-scopes the query', async () => {
      queryResult = Promise.resolve({ data: [ORDER_BASE], error: null });
      render(<OrdersPage />);
      await waitFor(() => expect(screen.getByText('#A1B2C3')).toBeTruthy());

      fireEvent.click(screen.getByRole('button', { name: 'Hoy' }));

      await waitFor(() => expect(gteCalls.length).toBeGreaterThan(0));
      expect(screen.getByRole('button', { name: 'Hoy' }).className).toContain('active');
    });
  });

  it('scopes the orders query to the current branch (branch-scoped visibility)', async () => {
    queryResult = Promise.resolve({ data: [ORDER_BASE], error: null });
    render(<OrdersPage />);
    await waitFor(() => expect(screen.getByText('#A1B2C3')).toBeTruthy());
    expect(eqCalls).toContainEqual(['branch_id', 'branch-1']);
  });

  it('pending order shows "Aceptar pedido" button instead of select', async () => {
    queryResult = Promise.resolve({ data: [ORDER_BASE], error: null });
    render(<OrdersPage />);
    await waitFor(() => expect(screen.getByText('#A1B2C3')).toBeTruthy());
    expect(screen.getByRole('button', { name: /aceptar pedido/i })).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('shows a "Nuevo pedido" link', async () => {
    queryResult = Promise.resolve({ data: [], error: null });
    render(<OrdersPage />);
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /nuevo pedido/i }).getAttribute('href')).toBe('/orders/new');
    });
  });

  it('"Notificar cliente" opens a wa.me link built from the customer phone and current status', async () => {
    queryResult = Promise.resolve({
      data: [{ ...ORDER_BASE, status: 'confirmed' }],
      error: null,
    });

    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<OrdersPage />);

    await waitFor(() => expect(screen.getByText('#A1B2C3')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /notificar cliente/i }));

    expect(openSpy).toHaveBeenCalledWith(
      'https://wa.me/595981123456?text=' +
        encodeURIComponent('Hola Juan! Tu pedido #A1B2C3 fue confirmado y ya lo estamos preparando.'),
      '_blank'
    );

    openSpy.mockRestore();
  });

  it('shows a relative timestamp on each order card', async () => {
    queryResult = Promise.resolve({ data: [ORDER_BASE], error: null });
    render(<OrdersPage />);
    await waitFor(() => expect(screen.getByText('#A1B2C3')).toBeTruthy());
    expect(screen.getByTestId('order-timestamp-o1')).toBeTruthy();
  });

  it('marks urgent cards when a pending order is older than 10 minutes', async () => {
    queryResult = Promise.resolve({
      data: [{ ...ORDER_BASE, created_at: '2026-01-01T10:00:00Z' }],
      error: null,
    });
    render(<OrdersPage />);
    await waitFor(() => expect(screen.getByText('#A1B2C3')).toBeTruthy());
    expect(screen.getByTestId('order-card-o1').getAttribute('data-urgent')).toBe('true');
  });

  it('does not mark recent pending orders as urgent', async () => {
    queryResult = Promise.resolve({
      data: [{ ...ORDER_BASE, created_at: new Date().toISOString() }],
      error: null,
    });
    render(<OrdersPage />);
    await waitFor(() => expect(screen.getByText('#A1B2C3')).toBeTruthy());
    expect(screen.getByTestId('order-card-o1').getAttribute('data-urgent')).toBeNull();
  });

  // SW-O1 (TDD RED->GREEN): advancing a "confirmed" order to "completed"
  // must open the atomic OrderPaymentSheet flow instead of a raw status
  // update.
  it('marcar "confirmed" como completado abre OrderPaymentSheet en vez de actualizar directo (SW-O1)', async () => {
    queryResult = Promise.resolve({ data: [{ ...ORDER_BASE, status: 'confirmed' }], error: null });
    render(<OrdersPage />);
    await waitFor(() => expect(screen.getByText('#A1B2C3')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /marcar completado/i }));

    await waitFor(() => expect(screen.getByText('Confirmar pago')).toBeTruthy());
    // Opening the payment sheet must not have issued a direct status update.
    expect(eqCalls).not.toContainEqual(['id', 'o1']);
  });

  // SW-O6 (TDD RED->GREEN): status write result must be checked before
  // mutating local state, and errors must be surfaced via toast.
  it('handleStatusChange: en éxito no muestra toast', async () => {
    queryResult = Promise.resolve({ data: [ORDER_BASE], error: null });
    mockUpdateResult = { data: { id: 'o1' }, error: null };
    render(<OrdersPage />);
    await waitFor(() => expect(screen.getByText('#A1B2C3')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /aceptar pedido/i }));

    await waitFor(() => expect(screen.queryByRole('button', { name: /aceptar pedido/i })).toBeNull());
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  // Regression (2026-09-22): confirming a delivery order with a fee must go
  // through confirm_order_delivery_fee (RPC), never a raw
  // updateOrderStatus(...).eq('id', ...) — that direct-table path is
  // blocked in production by the financial-fields guard trigger (item 6),
  // and was 400ing on every real "aceptar pedido con delivery" until this
  // fix.
  it('aceptar un pedido de delivery con costo de envío llama a confirm_order_delivery_fee, no a un update directo', async () => {
    queryResult = Promise.resolve({
      data: [{ ...ORDER_BASE, delivery_type: 'delivery' }],
      error: null,
    });
    render(<OrdersPage />);
    await waitFor(() => expect(screen.getByText('#A1B2C3')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /aceptar pedido/i }));
    const feeInput = await screen.findByLabelText(/costo de delivery/i);
    fireEvent.change(feeInput, { target: { value: '15000' } });
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));

    await waitFor(() => expect(rpcCalls.length).toBeGreaterThan(0));
    expect(rpcCalls).toContainEqual([
      'confirm_order_delivery_fee',
      { p_order_id: 'o1', p_delivery_fee: 15000 },
    ]);
    // No direct .update().eq('id', 'o1') for this order — the guard trigger
    // would 400 that path in real Postgres.
    expect(eqCalls).not.toContainEqual(['id', 'o1']);
  });

  it('handleStatusChange: en error de RLS muestra toast y NO cambia el estado local', async () => {
    queryResult = Promise.resolve({ data: [ORDER_BASE], error: null });
    mockUpdateResult = { data: null, error: { code: 'PGRST116' } };
    render(<OrdersPage />);
    await waitFor(() => expect(screen.getByText('#A1B2C3')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /aceptar pedido/i }));

    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith('Error al cambiar el estado del pedido', 'error')
    );
    // Card still shows "Aceptar pedido" — local state was not mutated.
    expect(screen.getByRole('button', { name: /aceptar pedido/i })).toBeTruthy();
  });
});
