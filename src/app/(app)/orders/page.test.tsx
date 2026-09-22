import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import OrdersPage from './page';

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
  mock.order = chainable;
  // handleStatusChange: .update(...).eq('id', ...).select('id').single()
  mock.update = () => mock;
  mock.single = () => Promise.resolve(mockUpdateResult);
  mock.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    resultPromise.then(onFulfilled, onRejected);
  return mock;
}

let queryResult: Promise<unknown>;

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => createQueryMock(queryResult),
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
    mockShowToast.mockReset();
    mockUpdateResult = { data: { id: 'o1' }, error: null };
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'branch-1', name: 'Centro', user_role: 'admin' },
      initialized: true,
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
