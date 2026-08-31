import { describe, it, expect } from 'vitest';
import { formatGs, formatOrderMessage, buildWhatsAppLink } from './storefront';

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
});
