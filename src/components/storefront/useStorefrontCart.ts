'use client';

import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { buildWhatsAppLink } from '@/lib/storefront';
import type { CheckoutFormValues } from './CheckoutForm';
import type { Branch, CreateStorefrontOrderResult, Service } from '@/types';

export interface CartLine {
  service: Service;
  qty: number;
}

export type StorefrontStep = 'catalog' | 'checkout' | 'success';

// PostgREST surfaces the RPC's `raise exception ... using errcode` as
// error.code — mapped here to user-facing Spanish copy (spec "Server-validated
// order creation"). Anything else (network error, unknown code) falls back to
// a generic message, never a silent success.
const ERROR_COPY: Record<string, string> = {
  VC400: 'Revisá los datos ingresados.',
  VC404: 'Tienda no disponible.',
  VC409: 'Uno de los servicios ya no está disponible. Actualizá la página.',
  VC429: 'Demasiados pedidos, esperá un minuto antes de intentar de nuevo.',
};

function copyForError(error: { code?: string; message?: string } | null): string {
  if (!error) return 'Ocurrió un error. Intentá de nuevo.';
  return ERROR_COPY[error.code ?? ''] ?? 'Ocurrió un error. Intentá de nuevo.';
}

/**
 * Shared cart + checkout logic for every storefront template (gastronomy,
 * retail, services). Owns: cart state, derived cart lines/total, the
 * create_storefront_order RPC call (with all its parameters), per-error-code
 * copy, and the final WhatsApp handoff link. Only the presentation differs
 * between templates — this hook is the single place that talks to the RPC.
 */
export function useStorefrontCart(branch: Branch, services: Service[]) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [step, setStep] = useState<StorefrontStep>('catalog');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<CreateStorefrontOrderResult | null>(null);

  const lines: CartLine[] = useMemo(
    () =>
      services
        .filter((s) => (cart[s.id] ?? 0) > 0)
        .map((s) => ({ service: s, qty: cart[s.id] })),
    [services, cart]
  );

  const total = useMemo(
    () => lines.reduce((sum, line) => sum + line.service.price * line.qty, 0),
    [lines]
  );

  const itemCount = useMemo(() => lines.reduce((sum, line) => sum + line.qty, 0), [lines]);

  const addToCart = (service: Service) => {
    setCart((prev) => ({ ...prev, [service.id]: (prev[service.id] ?? 0) + 1 }));
  };

  const increment = (serviceId: string) => {
    setCart((prev) => ({ ...prev, [serviceId]: (prev[serviceId] ?? 0) + 1 }));
  };

  const decrement = (serviceId: string) => {
    setCart((prev) => {
      const next = { ...prev };
      const qty = (next[serviceId] ?? 0) - 1;
      if (qty <= 0) {
        delete next[serviceId];
      } else {
        next[serviceId] = qty;
      }
      return next;
    });
  };

  const goToCheckout = () => setStep('checkout');
  const backToCatalog = () => setStep('catalog');

  const handleSubmit = async (values: CheckoutFormValues) => {
    setSubmitting(true);
    setErrorMessage(null);

    const supabase = createClient();
    const { data, error } = await supabase.rpc('create_storefront_order', {
      p_slug: branch.slug,
      p_customer_name: values.name,
      p_customer_phone: values.phone,
      p_customer_email: values.email || null,
      p_note: values.note || null,
      p_items: lines.map((line) => ({ service_id: line.service.id, qty: line.qty })),
      p_payment_method: values.paymentMethod,
      p_delivery_type: values.deliveryType,
      p_delivery_address: values.deliveryType === 'delivery' ? values.deliveryAddress : null,
    });

    setSubmitting(false);

    // Only on confirmed success do we move to the success step and build the
    // WhatsApp link — a failed RPC call never implies an order exists (spec
    // "No link on failure").
    if (error || !data) {
      setErrorMessage(copyForError(error));
      return;
    }

    setResult(data as CreateStorefrontOrderResult);
    setStep('success');
  };

  const whatsappHref = result
    ? buildWhatsAppLink(result.whatsapp_number ?? '', result.whatsapp_message)
    : null;

  return {
    cart,
    lines,
    total,
    itemCount,
    step,
    submitting,
    errorMessage,
    result,
    whatsappHref,
    addToCart,
    increment,
    decrement,
    goToCheckout,
    backToCatalog,
    handleSubmit,
  };
}
