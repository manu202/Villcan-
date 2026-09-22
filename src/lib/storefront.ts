import type { Order } from '@/types';

// Pure helpers for the public storefront (public-storefront capability).
//
// Q-3 (audit finding, resolved 2026-09-22): this file used to also contain
// formatOrderMessage(), a TypeScript mirror of the WhatsApp message text
// built inside create_storefront_order/create_manual_order. It had already
// diverged from the SQL version (the TS copy only added a "Pago" line for
// delivery orders; the SQL always adds it) — a second source of truth
// nobody was keeping in sync. Turned out nothing in the app actually called
// it: useStorefrontCart.ts always reads the real, already-built
// `result.whatsapp_message` straight from the RPC response (the message
// stored in `orders.whatsapp_message`), never regenerates it client-side.
// Removed rather than "unified" — there was only ever one live source
// (SQL), the TS copy was dead code exercised only by its own tests.
//
// `formatGs` mirrors `public.format_gs(int)` and stays: it's genuinely used
// by `buildStatusNotificationMessage` below, a real, separate message (the
// "Notificar cliente" status update) that IS built client-side on purpose.

/**
 * Thousands-separator formatter for guarani amounts inside WhatsApp
 * messages built client-side (buildStatusNotificationMessage). Mirrors
 * `public.format_gs(int)` — NOT the same as `formatGuaranies` in
 * src/lib/utils.ts, which prefixes "₲" for on-screen display; this one is
 * bare digits+dots to match the SQL-built text style.
 */
export function formatGs(amount: number): string {
  return Math.round(amount).toLocaleString('en-US').replace(/,/g, '.');
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
