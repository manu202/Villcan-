import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OrderPaymentSheet } from './OrderPaymentSheet';
import type { Order, OrderItem } from '@/types';

vi.mock('./AppSheet', () => ({
  AppSheet: ({
    open,
    children,
    footer,
  }: {
    open: boolean;
    children: React.ReactNode;
    footer?: React.ReactNode;
    title?: string;
    onOpenChange?: (v: boolean) => void;
  }) => (open ? <div data-testid="app-sheet">{children}{footer}</div> : null),
}));

vi.mock('@/lib/utils', () => ({
  formatGuaranies: (n: number) => `₲${n}`,
}));

let lastMovementInsert: Record<string, unknown> | null = null;
let lastOrderUpdate: Record<string, unknown> | null = null;

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: 'user-1' } } }),
    },
    from: (table: string) => {
      if (table === 'movements') {
        return {
          insert: (payload: Record<string, unknown>) => {
            lastMovementInsert = payload;
            return Promise.resolve({ error: null });
          },
        };
      }
      if (table === 'orders') {
        return {
          update: (payload: Record<string, unknown>) => ({
            eq: (_col: string, _val: string) => {
              lastOrderUpdate = payload;
              return Promise.resolve({ error: null });
            },
          }),
        };
      }
      return {};
    },
  }),
}));

const BASE_ORDER: Order = {
  id: 'order-1',
  branch_id: 'branch-1',
  order_code: 'ABC123',
  customer_name: 'Juan Pérez',
  customer_phone: '0981123456',
  customer_email: null,
  contact_id: 'contact-1',
  note: null,
  status: 'confirmed',
  total: 50000,
  whatsapp_message: '',
  payment_method: 'efectivo',
  delivery_type: 'pickup',
  delivery_address: null,
  delivery_fee: null,
  delivery_location: null,
  created_at: '2026-09-08T10:00:00Z',
};

const BASE_ITEMS: OrderItem[] = [
  { id: 'oi-1', order_id: 'order-1', service_id: 's1', name_snapshot: 'Lomo', qty: 1, unit_price: 50000, line_total: 50000 },
];

// ─── Efectivo mode (REQ-PAY-1) ────────────────────────────────────────────────

describe('OrderPaymentSheet — efectivo (REQ-PAY-1)', () => {
  beforeEach(() => {
    lastMovementInsert = null;
    lastOrderUpdate = null;
  });

  it('renders total del pedido', () => {
    render(
      <OrderPaymentSheet
        order={BASE_ORDER}
        items={BASE_ITEMS}
        open={true}
        onOpenChange={vi.fn()}
        onCompleted={vi.fn()}
      />
    );
    expect(screen.getByTestId('ops-total').textContent).toBe('₲50000');
  });

  it('muestra input de monto recibido', () => {
    render(
      <OrderPaymentSheet
        order={BASE_ORDER}
        items={BASE_ITEMS}
        open={true}
        onOpenChange={vi.fn()}
        onCompleted={vi.fn()}
      />
    );
    expect(screen.getByPlaceholderText('Monto recibido')).toBeTruthy();
  });

  it('botón confirmar deshabilitado cuando monto < total', () => {
    render(
      <OrderPaymentSheet
        order={BASE_ORDER}
        items={BASE_ITEMS}
        open={true}
        onOpenChange={vi.fn()}
        onCompleted={vi.fn()}
      />
    );
    const btn = screen.getByRole('button', { name: /confirmar/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it('botón confirmar habilitado cuando monto >= total', async () => {
    render(
      <OrderPaymentSheet
        order={BASE_ORDER}
        items={BASE_ITEMS}
        open={true}
        onOpenChange={vi.fn()}
        onCompleted={vi.fn()}
      />
    );
    fireEvent.change(screen.getByPlaceholderText('Monto recibido'), { target: { value: '50000' } });
    await waitFor(() =>
      expect((screen.getByRole('button', { name: /confirmar/i }) as HTMLButtonElement).disabled).toBe(false)
    );
  });

  it('muestra vuelto cuando monto > total', async () => {
    render(
      <OrderPaymentSheet
        order={BASE_ORDER}
        items={BASE_ITEMS}
        open={true}
        onOpenChange={vi.fn()}
        onCompleted={vi.fn()}
      />
    );
    fireEvent.change(screen.getByPlaceholderText('Monto recibido'), { target: { value: '60000' } });
    await waitFor(() => expect(screen.getByTestId('ops-vuelto').textContent).toBe('₲10000'));
  });

  it('inserta movimiento con income/expense correctos y marca el pedido completed', async () => {
    const onCompleted = vi.fn();
    render(
      <OrderPaymentSheet
        order={BASE_ORDER}
        items={BASE_ITEMS}
        open={true}
        onOpenChange={vi.fn()}
        onCompleted={onCompleted}
      />
    );
    fireEvent.change(screen.getByPlaceholderText('Monto recibido'), { target: { value: '60000' } });
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));
    await waitFor(() => expect(lastMovementInsert).not.toBeNull());
    expect(lastMovementInsert).toMatchObject({
      type: 'servicio',
      amount_charged: 50000,
      income: 50000,
      expense: 10000,
      payment_method: 'efectivo',
      order_id: 'order-1',
      contact_id: 'contact-1',
      branch_id: 'branch-1',
      user_id: 'user-1',
    });
    expect(lastOrderUpdate).toMatchObject({ status: 'completed' });
    await waitFor(() => expect(onCompleted).toHaveBeenCalled());
  });
});

// ─── Transferencia mode (REQ-PAY-2) ──────────────────────────────────────────

describe('OrderPaymentSheet — transferencia (REQ-PAY-2)', () => {
  const ORDER_TRANSFERENCIA: Order = { ...BASE_ORDER, payment_method: 'transferencia' };

  beforeEach(() => {
    lastMovementInsert = null;
    lastOrderUpdate = null;
  });

  it('NO muestra input de monto recibido', () => {
    render(
      <OrderPaymentSheet
        order={ORDER_TRANSFERENCIA}
        items={BASE_ITEMS}
        open={true}
        onOpenChange={vi.fn()}
        onCompleted={vi.fn()}
      />
    );
    expect(screen.queryByPlaceholderText('Monto recibido')).toBeNull();
  });

  it('botón confirmar habilitado sin necesidad de ingresar monto', () => {
    render(
      <OrderPaymentSheet
        order={ORDER_TRANSFERENCIA}
        items={BASE_ITEMS}
        open={true}
        onOpenChange={vi.fn()}
        onCompleted={vi.fn()}
      />
    );
    expect((screen.getByRole('button', { name: /confirmar/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('inserta movimiento con income=total, expense=0 y llama onCompleted', async () => {
    const onCompleted = vi.fn();
    render(
      <OrderPaymentSheet
        order={ORDER_TRANSFERENCIA}
        items={BASE_ITEMS}
        open={true}
        onOpenChange={vi.fn()}
        onCompleted={onCompleted}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));
    await waitFor(() => expect(lastMovementInsert).not.toBeNull());
    expect(lastMovementInsert).toMatchObject({
      type: 'servicio',
      amount_charged: 50000,
      income: 50000,
      expense: 0,
      payment_method: 'transferencia',
      order_id: 'order-1',
    });
    expect(lastOrderUpdate).toMatchObject({ status: 'completed' });
    await waitFor(() => expect(onCompleted).toHaveBeenCalled());
  });
});

// ─── Closed (REQ-PAY-3) ───────────────────────────────────────────────────────

describe('OrderPaymentSheet — closed', () => {
  it('no renderiza nada cuando open=false', () => {
    render(
      <OrderPaymentSheet
        order={BASE_ORDER}
        items={BASE_ITEMS}
        open={false}
        onOpenChange={vi.fn()}
        onCompleted={vi.fn()}
      />
    );
    expect(screen.queryByTestId('app-sheet')).toBeNull();
  });
});
