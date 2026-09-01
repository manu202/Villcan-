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

  lines.push('', `*Total: Gs. ${formatGs(input.total)}*`);

  return lines.join('\n');
}

/**
 * Builds the wa.me handoff link. Called client-side ONLY after
 * create_storefront_order confirms the order was created — never before,
 * so a failed RPC call never implies a false success (see spec "No link on
 * failure"). `wa.me` requires the number as digits + country code only, no
 * `+`/spaces/dashes.
 */
export function buildWhatsAppLink(whatsappNumber: string, message: string): string {
  const digitsOnly = whatsappNumber.replace(/\D/g, '');
  return `https://wa.me/${digitsOnly}?text=${encodeURIComponent(message)}`;
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
      return `Hola ${name}! Tu pedido #${code} fue confirmado y ya lo estamos preparando.`;
    case 'completed':
      return order.delivery_type === 'pickup'
        ? `Hola ${name}! Tu pedido #${code} ya está listo. Podés pasar a retirarlo cuando quieras.`
        : `Hola ${name}! Tu pedido #${code} salió en camino. En breve lo recibís.`;
    case 'cancelled':
      return `Hola ${name}, tu pedido #${code} fue cancelado. Cualquier consulta, escribinos.`;
  }
}
