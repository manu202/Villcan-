import { describe, it, expect } from 'vitest';
import { formatGs, formatOrderMessage, buildWhatsAppLink, buildStatusNotificationMessage } from './storefront';
import type { Order } from '@/types';

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    branch_id: 'branch-1',
    order_code: 'A1B2C3',
    customer_name: 'Juan',
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
    created_at: '2026-08-31T10:00:00Z',
    ...overrides,
  };
}

describe('formatGs (REQ: WhatsApp message thousands separator)', () => {
  it('formats a large amount with dot thousands separators', () => {
    expect(formatGs(110000)).toBe('110.000');
  });

  it('formats a small amount without separators', () => {
    expect(formatGs(500)).toBe('500');
  });
});

describe('formatOrderMessage (REQ: WhatsApp order handoff — TS mirror of the SQL-built message)', () => {
  it('builds the exact format from design.md, including a note line', () => {
    const message = formatOrderMessage({
      orderCode: 'A1B2C3',
      branchName: 'Villcan Centro',
      customerName: 'Juan Pérez',
      customerPhone: '0981123456',
      items: [
        { name: 'Corte clásico', qty: 2, unitPrice: 40000, lineTotal: 80000 },
        { name: 'Barba', qty: 1, unitPrice: 30000, lineTotal: 30000 },
      ],
      note: 'sin gel',
      total: 110000,
    });

    expect(message).toBe(
      '*Pedido #A1B2C3* — Villcan Centro\n\n' +
      '*Cliente:* Juan Pérez\n' +
      '*Teléfono:* 0981123456\n\n' +
      '*Pedido:*\n' +
      '• 2x Corte clásico — Gs. 80.000\n' +
      '• 1x Barba — Gs. 30.000\n' +
      '\n*Nota:* sin gel\n' +
      '\n*Total: Gs. 110.000*'
    );
  });

  it('omits the Nota line entirely when there is no note (different data path)', () => {
    const message = formatOrderMessage({
      orderCode: 'X9Y8Z7',
      branchName: 'Villcan Norte',
      customerName: 'Ana',
      customerPhone: '0981000000',
      items: [{ name: 'Corte', qty: 1, unitPrice: 25000, lineTotal: 25000 }],
      note: null,
      total: 25000,
    });

    expect(message).not.toContain('Nota');
    expect(message).toBe(
      '*Pedido #X9Y8Z7* — Villcan Norte\n\n' +
      '*Cliente:* Ana\n' +
      '*Teléfono:* 0981000000\n\n' +
      '*Pedido:*\n' +
      '• 1x Corte — Gs. 25.000\n' +
      '\n*Total: Gs. 25.000*'
    );
  });
});

describe('buildWhatsAppLink (REQ: WhatsApp order handoff — link only after confirmed order)', () => {
  it('builds a wa.me link with the digits-only number and URL-encoded message', () => {
    const href = buildWhatsAppLink('595981123456', 'Hola\nmundo');
    expect(href).toBe('https://wa.me/595981123456?text=Hola%0Amundo');
  });

  it('strips non-digit characters from the number (different input, different path)', () => {
    const href = buildWhatsAppLink('+595 981-123456', 'Pedido #A1');
    expect(href).toBe('https://wa.me/595981123456?text=Pedido%20%23A1');
  });

  it('works the same for a customer phone number (does not assume it is the business number)', () => {
    const href = buildWhatsAppLink('0981123456', 'Hola!');
    expect(href).toBe('https://wa.me/0981123456?text=Hola!');
  });
});

describe('buildStatusNotificationMessage (REQ: order-notify-customer — WhatsApp status update text)', () => {
  it('builds the pending message with the business name', () => {
    const order = makeOrder({ status: 'pending', customer_name: 'Juan', order_code: 'A1B2C3' });
    expect(buildStatusNotificationMessage(order, 'Villcan Centro')).toBe(
      'Hola Juan! Recibimos tu pedido #A1B2C3 en Villcan Centro y lo estamos procesando. Te avisamos apenas lo confirmemos.'
    );
  });

  it('omits "en {businessName}" entirely when the business name is blank (no dangling "en .")', () => {
    const order = makeOrder({ status: 'pending', customer_name: 'Juan', order_code: 'A1B2C3' });
    expect(buildStatusNotificationMessage(order, '')).toBe(
      'Hola Juan! Recibimos tu pedido #A1B2C3 y lo estamos procesando. Te avisamos apenas lo confirmemos.'
    );
  });

  it('builds the confirmed message', () => {
    const order = makeOrder({ status: 'confirmed', customer_name: 'Ana', order_code: 'X9Y8Z7' });
    expect(buildStatusNotificationMessage(order, 'Villcan Centro')).toBe(
      'Hola Ana! Tu pedido #X9Y8Z7 fue confirmado y ya lo estamos preparando.'
    );
  });

  it('builds the completed message for pickup orders', () => {
    const order = makeOrder({
      status: 'completed',
      delivery_type: 'pickup',
      customer_name: 'Juan',
      order_code: 'A1B2C3',
    });
    expect(buildStatusNotificationMessage(order, 'Villcan Centro')).toBe(
      'Hola Juan! Tu pedido #A1B2C3 ya está listo. Podés pasar a retirarlo cuando quieras.'
    );
  });

  it('builds the completed message for delivery orders (different data path)', () => {
    const order = makeOrder({
      status: 'completed',
      delivery_type: 'delivery',
      customer_name: 'Ana',
      order_code: 'X9Y8Z7',
    });
    expect(buildStatusNotificationMessage(order, 'Villcan Centro')).toBe(
      'Hola Ana! Tu pedido #X9Y8Z7 salió en camino. En breve lo recibís.'
    );
  });

  it('builds the cancelled message', () => {
    const order = makeOrder({ status: 'cancelled', customer_name: 'Juan', order_code: 'A1B2C3' });
    expect(buildStatusNotificationMessage(order, 'Villcan Centro')).toBe(
      'Hola Juan, tu pedido #A1B2C3 fue cancelado. Cualquier consulta, escribinos.'
    );
  });
});
