import { describe, it, expect } from 'vitest';
import { formatGs, buildWhatsAppLink, buildStatusNotificationMessage, normalizeWhatsAppNumber } from './storefront';
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
    delivery_fee: null,
    delivery_location: null,
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

describe('buildWhatsAppLink (REQ: WhatsApp order handoff — link only after confirmed order)', () => {
  it('builds a wa.me link with the digits-only number and URL-encoded message', () => {
    const href = buildWhatsAppLink('595981123456', 'Hola\nmundo');
    expect(href).toBe('https://wa.me/595981123456?text=Hola%0Amundo');
  });

  it('strips non-digit characters from the number (different input, different path)', () => {
    const href = buildWhatsAppLink('+595 981-123456', 'Pedido #A1');
    expect(href).toBe('https://wa.me/595981123456?text=Pedido%20%23A1');
  });

  it('normalizes a leading-0 number to full country code (Paraguay local → international)', () => {
    const href = buildWhatsAppLink('0981123456', 'Hola!');
    expect(href).toBe('https://wa.me/595981123456?text=Hola!');
  });
});

describe('normalizeWhatsAppNumber (REQ: branches.whatsapp_number — normalize to wa.me-compatible format)', () => {
  it('returns null for empty string', () => {
    expect(normalizeWhatsAppNumber('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(normalizeWhatsAppNumber('   ')).toBeNull();
  });

  it('prepends 595 and strips leading 0 for local Paraguay format', () => {
    expect(normalizeWhatsAppNumber('0981123456')).toBe('595981123456');
  });

  it('keeps the number unchanged when it already starts with 595', () => {
    expect(normalizeWhatsAppNumber('595981123456')).toBe('595981123456');
  });

  it('strips non-digit characters (+ spaces dashes) before normalizing', () => {
    expect(normalizeWhatsAppNumber('+595 981-123456')).toBe('595981123456');
  });

  it('passes through non-Paraguay country codes unchanged', () => {
    expect(normalizeWhatsAppNumber('5491112345678')).toBe('5491112345678');
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

  it('builds the confirmed message for pickup orders', () => {
    const order = makeOrder({ status: 'confirmed', delivery_type: 'pickup', customer_name: 'Ana', order_code: 'X9Y8Z7' });
    expect(buildStatusNotificationMessage(order, 'Villcan Centro')).toBe(
      'Hola Ana! Tu pedido #X9Y8Z7 fue confirmado y ya lo estamos preparando.'
    );
  });

  it('builds confirmed delivery message with subtotal + fee + total breakdown', () => {
    const order = makeOrder({
      status: 'confirmed',
      delivery_type: 'delivery',
      customer_name: 'Ana',
      order_code: 'X9Y8Z7',
      total: 50000,
      delivery_fee: 15000,
    });
    expect(buildStatusNotificationMessage(order, 'Villcan Centro')).toBe(
      'Hola Ana! Tu pedido #X9Y8Z7 fue confirmado y ya lo estamos preparando. Subtotal: Gs. 50.000. Costo de delivery: Gs. 15.000. Total a abonar: Gs. 65.000.'
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
