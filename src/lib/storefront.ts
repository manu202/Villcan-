import type { Order } from '@/types';

// Pure helpers for the public storefront (public-storefront capability).
// `formatGs`/`formatOrderMessage` mirror public.format_gs / the message
// built inside create_storefront_order (supabase/migrations/20260831140000_storefront.sql)
// exactly — the RPC is the actual source of truth for `orders.whatsapp_message`
// (persisted server-side), this TS copy exists so the format can be unit
// tested and reused client-side (e.g. a checkout preview) without a round
// trip. See design "Mensaje de WhatsApp".

export interface StorefrontOrderLine {
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

export interface FormatOrderMessageInput {
  orderCode: string;
  branchName: string;
  customerName: string;
  customerPhone: string;
  items: StorefrontOrderLine[];
  note?: string | null;
  total: number;
  paymentMethod?: string;
  deliveryType?: 'pickup' | 'delivery';
  deliveryAddress?: string | null;
  deliveryLocation?: { lat: number; lng: number } | null;
}

/**
 * Thousands-separator formatter for guarani amounts inside the WhatsApp
 * message. Mirrors `public.format_gs(int)` — NOT the same as
 * `formatGuaranies` in src/lib/utils.ts, which prefixes "₲" for on-screen
 * display; this one is bare digits+dots to match the SQL-built text exactly.
 */
export function formatGs(amount: number): string {
  return Math.round(amount).toLocaleString('en-US').replace(/,/g, '.');
}

/**
 * Builds the exact WhatsApp order message text. Fixed order: code+branch /
 * customer+phone / items / note (omitted entirely when null/empty) / total.
 */
export function formatOrderMessage(input: FormatOrderMessageInput): string {
  const lines: string[] = [
    `*Pedido #${input.orderCode}* — ${input.branchName}`,
    '',
    `*Cliente:* ${input.customerName}`,
    `*Teléfono:* ${input.customerPhone}`,
    '',
    '*Pedido:*',
  ];

  for (const item of input.items) {
    lines.push(`• ${item.qty}x ${item.name} — Gs. ${formatGs(item.lineTotal)}`);
  }

  if (input.note && input.note.trim().length > 0) {
    lines.push('', `*Nota:* ${input.note.trim()}`);
  }

  if (input.deliveryType === 'delivery') {
    const paymentLabel = input.paymentMethod === 'transferencia' ? 'Transferencia' : 'Efectivo';
    lines.push('', `*Pago:* ${paymentLabel}`);
    lines.push(`*Entrega:* Delivery${input.deliveryAddress ? ` — ${input.deliveryAddress}` : ''}`);
    if (input.deliveryLocation) {
      lines.push(`📍 https://maps.google.com/?q=${input.deliveryLocation.lat},${input.deliveryLocation.lng}`);
    }
    lines.push('', `*Subtotal: Gs. ${formatGs(input.total)}*`);
    lines.push('_Costo de delivery: a confirmar por el local_');
  } else {
    lines.push('', `*Total: Gs. ${formatGs(input.total)}*`);
  }

  return lines.join('\n');
}

/**
 * Normalizes a raw WhatsApp number to digits-only international format
 * for wa.me links. Handles Paraguay local numbers (leading 0 → prepend 595).
 * Returns null when the input is blank.
 */
export function normalizeWhatsAppNumber(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('595')) return digits;
  if (digits.startsWith('0')) return '595' + digits.slice(1);
  return digits;
}

/**
 * Builds the wa.me handoff link. Called client-side ONLY after
 * create_storefront_order confirms the order was created — never before,
 * so a failed RPC call never implies a false success (see spec "No link on
 * failure"). `wa.me` requires the number as digits + country code only, no
 * `+`/spaces/dashes.
 */
export function buildWhatsAppLink(whatsappNumber: string, message: string): string {
  const digits = whatsappNumber.replace(/\D/g, '');
  const normalized = digits.startsWith('0') ? '595' + digits.slice(1) : digits;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

/**
 * Builds the "Notificar cliente" WhatsApp message text for an order's
 * CURRENT status (order-notify-customer capability). Pure — no side effects,
 * no I/O — so the staff-facing /orders and /orders/[id] pages can call it
 * directly for the "Notificar cliente" button, which sends the customer a
 * ready-made status update via `buildWhatsAppLink(order.customer_phone, ...)`.
 *
 * `businessName` is only used in the `pending` message; when blank (matches
 * the tone of the RPC-built order message, which never leaves a dangling
 * "en ." when a field is missing) it's omitted entirely rather than leaving
 * an awkward "en ." in the text.
 */
export function buildStatusNotificationMessage(order: Order, businessName: string): string {
  const name = order.customer_name;
  const code = order.order_code;
  const business = businessName.trim();

  switch (order.status) {
    case 'pending': {
      const suffix = business ? ` en ${business}` : '';
      return `Hola ${name}! Recibimos tu pedido #${code}${suffix} y lo estamos procesando. Te avisamos apenas lo confirmemos.`;
    }
    case 'confirmed':
      if (order.delivery_type === 'delivery' && order.delivery_fee != null) {
        const subtotal = formatGs(order.total);
        const fee = formatGs(order.delivery_fee);
        const total = formatGs(order.total + order.delivery_fee);
        return `Hola ${name}! Tu pedido #${code} fue confirmado y ya lo estamos preparando. Subtotal: Gs. ${subtotal}. Costo de delivery: Gs. ${fee}. Total a abonar: Gs. ${total}.`;
      }
      return `Hola ${name}! Tu pedido #${code} fue confirmado y ya lo estamos preparando.`;
    case 'completed':
      if (order.delivery_type === 'pickup') {
        return `Hola ${name}! Tu pedido #${code} ya está listo. Podés pasar a retirarlo cuando quieras.`;
      } else {
        const feeText = order.delivery_fee != null
          ? ` El costo de delivery es Gs. ${formatGs(order.delivery_fee)}.`
          : '';
        return `Hola ${name}! Tu pedido #${code} salió en camino.${feeText} En breve lo recibís.`;
      }
    case 'cancelled':
      return `Hola ${name}, tu pedido #${code} fue cancelado. Cualquier consulta, escribinos.`;
  }
}
