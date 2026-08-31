'use client';

import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { buildWhatsAppLink } from '@/lib/storefront';
import { ServiceCard } from './ServiceCard';
import { CartSheet, type CartLine } from './CartSheet';
import { CheckoutForm, type CheckoutFormValues } from './CheckoutForm';
import { OrderSuccess } from './OrderSuccess';
import type { Branch, CreateStorefrontOrderResult, Service } from '@/types';

interface StorefrontClientProps {
  branch: Branch;
  services: Service[];
}

type Step = 'catalog' | 'checkout' | 'success';

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

export function StorefrontClient({ branch, services }: StorefrontClientProps) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [step, setStep] = useState<Step>('catalog');
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

  if (step === 'success' && result) {
    const href = buildWhatsAppLink(result.whatsapp_number ?? '', result.whatsapp_message);
    return <OrderSuccess orderCode={result.order_code} whatsappHref={href} />;
  }

  if (step === 'checkout') {
    return (
      <CheckoutForm
        submitting={submitting}
        errorMessage={errorMessage}
        onSubmit={handleSubmit}
        onBack={() => setStep('catalog')}
      />
    );
  }

  return (
    <div className="storefront-catalog">
      <ul className="storefront-service-list">
        {services.map((service) => (
          <ServiceCard
            key={service.id}
            service={service}
            qtyInCart={cart[service.id] ?? 0}
            onAdd={addToCart}
          />
        ))}
      </ul>
      <CartSheet
        lines={lines}
        onIncrement={increment}
        onDecrement={decrement}
        onCheckout={() => setStep('checkout')}
      />

      <style>{`
        .storefront-service-list {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 1px;
          background: var(--border);
        }
      `}</style>
    </div>
  );
}
