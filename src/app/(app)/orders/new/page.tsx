'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useBranch } from '@/contexts/BranchContext';
import { ServiceCard } from '@/components/storefront/ServiceCard';
import { CartSheet, type CartLine } from '@/components/storefront/CartSheet';
import { CheckoutForm, type CheckoutFormValues } from '@/components/storefront/CheckoutForm';
import type { Service } from '@/types';

// Same error-code -> copy mapping used by the public storefront (spec
// "Server-validated order creation" applies to manual orders too — the RPC
// raises the same VC4xx codes).
const ERROR_COPY: Record<string, string> = {
  VC400: 'Revisá los datos ingresados.',
  VC403: 'No tenés permisos para cargar pedidos en esta sucursal.',
  VC404: 'Sucursal no encontrada.',
  VC409: 'Uno de los servicios ya no está disponible. Actualizá la página.',
};

function copyForError(error: { code?: string; message?: string } | null): string {
  if (!error) return 'Ocurrió un error. Intentá de nuevo.';
  return ERROR_COPY[error.code ?? ''] ?? 'Ocurrió un error. Intentá de nuevo.';
}

type Step = 'catalog' | 'checkout';

export default function NewManualOrderPage() {
  const { currentBranch, initialized } = useBranch();
  const router = useRouter();

  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [step, setStep] = useState<Step>('catalog');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const currentBranchRef = useRef(currentBranch);
  useEffect(() => {
    currentBranchRef.current = currentBranch;
  }, [currentBranch]);

  useEffect(() => {
    if (!initialized || !currentBranch) return;
    const loadServices = async () => {
      setLoading(true);
      const supabase = createClient();
      const { data } = await supabase
        .from('services')
        .select('*')
        .eq('is_active', true)
        .eq('is_available', true)
        .or(`branch_id.eq.${currentBranch.id},branch_id.is.null`)
        .order('name');
      setServices((data as Service[]) || []);
      setLoading(false);
    };
    loadServices();
  }, [initialized, currentBranch]);

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
    const branch = currentBranchRef.current;
    if (!branch) return;

    setSubmitting(true);
    setErrorMessage(null);

    const supabase = createClient();
    const { data, error } = await supabase.rpc('create_manual_order', {
      p_branch_id: branch.id,
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

    if (error || !data) {
      setErrorMessage(copyForError(error));
      return;
    }

    router.push(`/orders/${data.order_id}`);
  };

  if (!initialized || loading) {
    return (
      <div className="page">
        <p className="page-subtitle">Cargando...</p>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header flex-header">
        <Link href="/orders" className="back-btn">←</Link>
        <h1 className="page-title">Nuevo pedido</h1>
      </header>

      {step === 'checkout' ? (
        <CheckoutForm
          submitting={submitting}
          errorMessage={errorMessage}
          onSubmit={handleSubmit}
          onBack={() => setStep('catalog')}
        />
      ) : (
        <>
          <ul className="manual-order-service-list">
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
        </>
      )}

      <style>{`
        .page {
          max-width: 480px;
          margin: 0 auto;
        }
        .flex-header {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .back-btn {
          width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          background: var(--surface-elevated);
          border-radius: 8px;
          color: var(--text-primary);
          text-decoration: none;
        }
        .manual-order-service-list {
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
