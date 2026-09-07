import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OrderCard } from './OrderCard';
import type { OrderWithItems } from '@/types';

vi.mock('@/lib/utils', () => ({
  formatRelativeTime: () => 'Hace 45 min',
  isOlderThan: () => false,
  formatGuaranies: (n: number) => `₲ ${n.toLocaleString()}`,
}));

vi.mock('@/lib/storefront', () => ({
  buildStatusNotificationMessage: () => 'msg',
  buildWhatsAppLink: () => 'https://wa.me/test',
}));

const BASE_ORDER: OrderWithItems = {
  id: 'o1',
  branch_id: 'b1',
  order_code: '1F5244',
  customer_name: 'Ivan',
  customer_phone: '0981123456',
  customer_email: null,
  contact_id: null,
  note: null,
  status: 'pending',
  total: 35000,
  whatsapp_message: '',
  payment_method: 'efectivo',
  delivery_type: 'pickup',
  delivery_address: null,
  created_at: '2026-09-07T10:00:00Z',
  order_items: [
    { id: 'i1', order_id: 'o1', service_id: 's1', name_snapshot: 'Lomo Completo', unit_price: 25000, qty: 1, line_total: 25000 },
    { id: 'i2', order_id: 'o1', service_id: 's2', name_snapshot: 'Coca-Cola', unit_price: 5000, qty: 2, line_total: 10000 },
  ],
};

describe('OrderCard — header', () => {
  it('muestra el código de orden', () => {
    render(<OrderCard order={BASE_ORDER} onStatusChange={vi.fn()} onNotify={vi.fn()} onClick={vi.fn()} />);
    expect(screen.getByText('#1F5244')).toBeTruthy();
  });

  it('muestra el monto total', () => {
    render(<OrderCard order={BASE_ORDER} onStatusChange={vi.fn()} onNotify={vi.fn()} onClick={vi.fn()} />);
    expect(screen.getByText(/35\.000/)).toBeTruthy();
  });

  it('muestra el badge de estado', () => {
    render(<OrderCard order={BASE_ORDER} onStatusChange={vi.fn()} onNotify={vi.fn()} onClick={vi.fn()} />);
    expect(screen.getByText('Pendiente')).toBeTruthy();
  });
});

describe('OrderCard — body (items)', () => {
  it('muestra el resumen de ítems', () => {
    render(<OrderCard order={BASE_ORDER} onStatusChange={vi.fn()} onNotify={vi.fn()} onClick={vi.fn()} />);
    expect(screen.getByText(/1× Lomo Completo/)).toBeTruthy();
    expect(screen.getByText(/2× Coca-Cola/)).toBeTruthy();
  });

  it('no muestra zona de ítems si está vacía', () => {
    const order = { ...BASE_ORDER, order_items: [] };
    render(<OrderCard order={order} onStatusChange={vi.fn()} onNotify={vi.fn()} onClick={vi.fn()} />);
    expect(screen.queryByTestId('order-card-items')).toBeNull();
  });
});

describe('OrderCard — footer', () => {
  it('muestra el nombre del cliente', () => {
    render(<OrderCard order={BASE_ORDER} onStatusChange={vi.fn()} onNotify={vi.fn()} onClick={vi.fn()} />);
    expect(screen.getByText('Ivan')).toBeTruthy();
  });

  it('muestra el timestamp relativo', () => {
    render(<OrderCard order={BASE_ORDER} onStatusChange={vi.fn()} onNotify={vi.fn()} onClick={vi.fn()} />);
    expect(screen.getByTestId('order-timestamp-o1')).toBeTruthy();
  });
});

describe('OrderCard — state advancement', () => {
  it('pending muestra botón "Aceptar pedido"', () => {
    render(<OrderCard order={BASE_ORDER} onStatusChange={vi.fn()} onNotify={vi.fn()} onClick={vi.fn()} />);
    expect(screen.getByRole('button', { name: /aceptar pedido/i })).toBeTruthy();
  });

  it('confirmed muestra botón "Marcar completado"', () => {
    const order = { ...BASE_ORDER, status: 'confirmed' as const };
    render(<OrderCard order={order} onStatusChange={vi.fn()} onNotify={vi.fn()} onClick={vi.fn()} />);
    expect(screen.getByRole('button', { name: /marcar completado/i })).toBeTruthy();
  });

  it('completed no muestra botón de avance', () => {
    const order = { ...BASE_ORDER, status: 'completed' as const };
    render(<OrderCard order={order} onStatusChange={vi.fn()} onNotify={vi.fn()} onClick={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /aceptar|completado/i })).toBeNull();
  });

  it('cancelled no muestra botón de avance', () => {
    const order = { ...BASE_ORDER, status: 'cancelled' as const };
    render(<OrderCard order={order} onStatusChange={vi.fn()} onNotify={vi.fn()} onClick={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /aceptar|completado/i })).toBeNull();
  });

  it('tap en "Aceptar pedido" llama onStatusChange con confirmed', () => {
    const onStatusChange = vi.fn();
    render(<OrderCard order={BASE_ORDER} onStatusChange={onStatusChange} onNotify={vi.fn()} onClick={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /aceptar pedido/i }));
    expect(onStatusChange).toHaveBeenCalledWith('o1', 'confirmed');
  });
});

describe('OrderCard — urgency', () => {
  it('tiene data-testid correcto', () => {
    render(<OrderCard order={BASE_ORDER} onStatusChange={vi.fn()} onNotify={vi.fn()} onClick={vi.fn()} />);
    expect(screen.getByTestId('order-card-o1')).toBeTruthy();
  });

  it('data-urgent es null cuando isOlderThan devuelve false', () => {
    render(<OrderCard order={BASE_ORDER} onStatusChange={vi.fn()} onNotify={vi.fn()} onClick={vi.fn()} />);
    const card = screen.getByTestId('order-card-o1');
    expect(card.getAttribute('data-urgent')).toBeNull();
  });
});
