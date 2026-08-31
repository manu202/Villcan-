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
