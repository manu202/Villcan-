'use client';

import { Banknote, ArrowLeftRight, CreditCard, type LucideIcon } from 'lucide-react';
import type { PaymentMethod, Contact } from '@/types';
import { formatGuaranies } from '@/lib/utils';
import type { CartLine } from '../storefront/CartSheet';

interface PaymentStepProps {
  onBack: () => void;
  cartLines: CartLine[];
  cartTotal: number;
  onSubmit: (e: React.FormEvent) => void;
  selectedContact: Contact | null;
  onClearContact: () => void;
  contactSearch: string;
  onContactSearchChange: (value: string) => void;
  contactsLoading: boolean;
  contacts: Contact[];
  onSelectContact: (contact: Contact) => void;
  onShowNewContact: () => void;
  attempted: boolean;
  paymentMethod: PaymentMethod | '';
  onSelectPaymentMethod: (method: PaymentMethod) => void;
  isSubmitting: boolean;
}

const paymentMethods: { value: PaymentMethod; label: string; icon: LucideIcon }[] = [
  { value: 'efectivo', label: 'Efectivo', icon: Banknote },
  { value: 'transferencia', label: 'Transferencia', icon: ArrowLeftRight },
  { value: 'pos', label: 'POS', icon: CreditCard },
];

export function PaymentStep({
  onBack,
  cartLines,
  cartTotal,
  onSubmit,
  selectedContact,
  onClearContact,
  contactSearch,
  onContactSearchChange,
  contactsLoading,
  contacts,
  onSelectContact,
  onShowNewContact,
  attempted,
  paymentMethod,
  onSelectPaymentMethod,
  isSubmitting,
}: PaymentStepProps) {
  return (
    <div className="page">
      <header className="page-header flex-header">
        <button onClick={onBack} className="back-btn">←</button>
        <h1 className="page-title">Pago</h1>
      </header>

      {/* Resumen del carrito */}
      <section className="section">
        <h2 className="section-title">Resumen</h2>
        <div className="summary-block">
          {cartLines.map((l) => (
            <div key={l.service.id} className="summary-row">
              <span>{l.service.name}{l.qty > 1 ? ` ×${l.qty}` : ''}</span>
              <span>{formatGuaranies(l.service.price * l.qty)}</span>
            </div>
          ))}
          <div className="summary-total-row">
            <span>Total</span>
            <span>{formatGuaranies(cartTotal)}</span>
          </div>
        </div>
      </section>

      <form onSubmit={onSubmit}>
        {/* Cliente (opcional) */}
        <section className="section">
          <h2 className="section-title">Cliente <span className="optional-mark">(opcional)</span></h2>
          {selectedContact ? (
            <div className="selected-contact">
              <span className="contact-name">{selectedContact.full_name}</span>
              <button
                type="button"
                className="clear-btn"
                onClick={onClearContact}
              >
                ✕
              </button>
            </div>
          ) : (
            <>
              <input
                type="text"
                placeholder="Buscar cliente..."
                value={contactSearch}
                onChange={(e) => onContactSearchChange(e.target.value)}
                className="input"
              />
              {contactsLoading ? (
                <p className="search-status">Buscando...</p>
              ) : contacts.length > 0 ? (
                <ul className="dropdown">
                  {contacts.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className="dropdown-item"
                        onClick={() => onSelectContact(c)}
                      >
                        {c.full_name}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : contactSearch.length >= 2 ? (
                <p className="search-status">Sin resultados</p>
              ) : null}
              <button type="button" className="link-btn" onClick={onShowNewContact}>
                + Crear nuevo cliente
              </button>
            </>
          )}
        </section>

        {/* Método de pago */}
        <section className="section">
          <h2 className="section-title">Método de pago</h2>
          {attempted && !paymentMethod && (
            <p className="field-error">Seleccioná un método de pago</p>
          )}
          <div className="method-grid">
            {paymentMethods.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => onSelectPaymentMethod(m.value)}
                className={`method-btn ${paymentMethod === m.value ? 'selected' : ''}`}
              >
                <m.icon size={16} className="method-icon" aria-hidden="true" />
                {m.label}
              </button>
            ))}
          </div>
        </section>


        <section className="section">
          <button
            type="submit"
            disabled={isSubmitting}
            className="btn-primary btn-full"
          >
            {isSubmitting ? 'Creando pedido...' : 'Crear pedido'}
          </button>
        </section>
      </form>

      <style>{`
        .summary-block {
          background: var(--surface-elevated);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 4px 14px;
        }
        .summary-row {
          display: flex;
          justify-content: space-between;
          font-size: 14px;
          color: var(--text-secondary);
          padding: 10px 0;
          border-bottom: 1px solid var(--border);
        }
        .summary-row:last-of-type { border-bottom: none; }
        .summary-total-row {
          display: flex;
          justify-content: space-between;
          font-size: 15px;
          font-weight: 700;
          color: var(--text-primary);
          padding: 12px 0;
          font-variant-numeric: tabular-nums;
        }
        .optional-mark {
          font-size: 11px;
          font-weight: 400;
          color: var(--text-muted);
          text-transform: none;
          letter-spacing: 0;
        }
      `}</style>
    </div>
  );
}
