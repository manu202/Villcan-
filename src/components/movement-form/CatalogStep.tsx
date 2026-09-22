'use client';

import type { Service } from '@/types';
import { ServiceCard } from '../storefront/ServiceCard';
import { CartSheet, type CartLine } from '../storefront/CartSheet';
import { ConfirmModal } from '../ConfirmModal';

interface CatalogStepProps {
  onBack: () => void;
  servicesLoading: boolean;
  servicesError: string | null;
  services: Service[];
  cart: Record<string, number>;
  onAdd: (service: Service) => void;
  cartLines: CartLine[];
  onIncrement: (serviceId: string) => void;
  onDecrement: (serviceId: string) => void;
  onCheckout: () => void;
  showDiscardConfirm: boolean;
  onConfirmDiscard: () => void;
  onCancelDiscard: () => void;
}

export function CatalogStep({
  onBack,
  servicesLoading,
  servicesError,
  services,
  cart,
  onAdd,
  cartLines,
  onIncrement,
  onDecrement,
  onCheckout,
  showDiscardConfirm,
  onConfirmDiscard,
  onCancelDiscard,
}: CatalogStepProps) {
  return (
    <div className="page page--catalog">
      <header className="page-header flex-header">
        <button onClick={onBack} className="back-btn">←</button>
        <h1 className="page-title">Nueva Venta</h1>
      </header>

      {servicesLoading ? (
        <p className="search-status" style={{ padding: '24px 0' }}>Cargando servicios...</p>
      ) : servicesError ? (
        <p className="search-status" style={{ padding: '24px 0', color: 'var(--error, #dc2626)' }}>
          Error al cargar servicios
        </p>
      ) : services.length === 0 ? (
        <p className="search-status" style={{ padding: '24px 0' }}>No hay servicios configurados</p>
      ) : (
        <ul className="catalog-list">
          {services.map((s) => (
            <ServiceCard
              key={s.id}
              service={s}
              qtyInCart={cart[s.id] ?? 0}
              onAdd={onAdd}
            />
          ))}
        </ul>
      )}

      <CartSheet
        lines={cartLines}
        onIncrement={onIncrement}
        onDecrement={onDecrement}
        onCheckout={onCheckout}
        checkoutLabel="Continuar con el pago →"
      />

      <style>{`
        .page--catalog { padding-bottom: 0; }
        .catalog-list {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 1px;
          background: var(--border);
        }
      `}</style>

      {showDiscardConfirm && (
        <ConfirmModal
          message="¿Descartar los datos ingresados?"
          onConfirm={onConfirmDiscard}
          onCancel={onCancelDiscard}
        />
      )}
    </div>
  );
}
