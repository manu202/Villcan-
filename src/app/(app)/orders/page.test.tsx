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

const eqCalls: Array<[string, unknown]> = [];

function createQueryMock(resultPromise: Promise<unknown>) {
  const mock: Record<string, unknown> = {};
  const chainable = () => mock;
  mock.select = chainable;
  mock.eq = (col: string, val: unknown) => {
    eqCalls.push([col, val]);
    return mock;
  };
  mock.order = chainable;
  mock.update = () => mock;
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
});
