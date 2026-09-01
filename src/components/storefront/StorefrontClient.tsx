'use client';

import { ServiceCard } from './ServiceCard';
import { CartSheet } from './CartSheet';
import { CheckoutForm } from './CheckoutForm';
import { OrderSuccess } from './OrderSuccess';
import { useStorefrontCart } from './useStorefrontCart';
import type { Branch, Service } from '@/types';

interface StorefrontClientProps {
  branch: Branch;
  services: Service[];
}

// Generic/fallback presentation for the shared cart hook — used directly by
// the barbershop/generic "services" template style. Gastronomy and retail
// verticals get their own richer presentations in
// src/components/storefront/templates/, all built on the same hook.
export function StorefrontClient({ branch, services }: StorefrontClientProps) {
  const {
    cart,
    lines,
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
  } = useStorefrontCart(branch, services);

  if (step === 'success' && result && whatsappHref) {
    return <OrderSuccess orderCode={result.order_code} whatsappHref={whatsappHref} />;
  }

  if (step === 'checkout') {
    return (
      <CheckoutForm
        submitting={submitting}
        errorMessage={errorMessage}
        onSubmit={handleSubmit}
        onBack={backToCatalog}
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
        onCheckout={goToCheckout}
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
