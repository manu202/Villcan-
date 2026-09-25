'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createManualOrder } from '@/lib/data/orders';
import { listActiveServicesForBranch } from '@/lib/data/services';
import { searchContacts } from '@/lib/data/contacts';
import { useBranch } from '@/contexts/BranchContext';
import { ServiceCard } from '@/components/storefront/ServiceCard';
import { CartSheet, type CartLine } from '@/components/storefront/CartSheet';
import { CheckoutForm, type CheckoutFormValues } from '@/components/storefront/CheckoutForm';
import { ContactForm } from '@/components/ContactForm';
import type { Service, Contact } from '@/types';

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

// UX-1 (2026-09-25): /orders/new used to reuse the storefront's own plain
// nombre/teléfono/email fields -- no way to search or reuse an existing
// contact, unlike MovementForm's Venta flow. This adds a 'customer' step
// (search + quick-create, same pattern as MovementForm/PaymentStep.tsx)
// between the cart and checkout.
type Step = 'catalog' | 'customer' | 'newContact' | 'checkout';

export default function NewManualOrderPage() {
  const { currentBranch, initialized } = useBranch();
  const router = useRouter();

  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [step, setStep] = useState<Step>('catalog');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [contactSearch, setContactSearch] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (contactSearch.length >= 2) {
      searchDebounceRef.current = setTimeout(async () => {
        setContactsLoading(true);
        const { data } = await searchContacts(contactSearch);
        setContacts((data as Contact[]) || []);
        setContactsLoading(false);
      }, 300);
    } else {
      setContacts([]);
      setContactsLoading(false);
    }
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [contactSearch]);

  // Shared by "select from search results" and "quick-create succeeded".
  // Blocks advancing when the contact has no phone on file (search only
  // selects id/full_name/phone -- a contact created without one, or an old
  // row predating that column being populated, would otherwise submit an
  // empty p_customer_phone to create_manual_order).
  const resolveContact = (contact: Contact) => {
    if (!contact.phone) {
      setContactError('Este cliente no tiene teléfono registrado. Elegí otro o agregale uno desde Contactos.');
      setStep('customer');
      return;
    }
    setContactError(null);
    setSelectedContact(contact);
    setContacts([]);
    setContactSearch(contact.full_name);
    setStep('checkout');
  };

  const currentBranchRef = useRef(currentBranch);
  useEffect(() => {
    currentBranchRef.current = currentBranch;
  }, [currentBranch]);

  useEffect(() => {
    if (!initialized || !currentBranch) return;
    const loadServices = async () => {
      setLoading(true);
      const { data } = await listActiveServicesForBranch(currentBranch.id);
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

    const { data, error } = await createManualOrder({
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
          onBack={() => setStep('customer')}
          customerName={selectedContact?.full_name}
          customerPhone={selectedContact?.phone ?? undefined}
        />
      ) : step === 'newContact' ? (
        <ContactForm
          onCancel={() => setStep('customer')}
          onSuccess={(contact) => resolveContact(contact as Contact)}
        />
      ) : step === 'customer' ? (
        <div className="customer-step">
          <button type="button" className="checkout-back-btn" onClick={() => setStep('catalog')}>
            ← Volver al menú
          </button>
          <h2 className="section-title">Cliente</h2>
          {contactError && <p className="field-error">{contactError}</p>}
          <input
            type="text"
            aria-label="Buscar cliente"
            placeholder="Buscar cliente..."
            value={contactSearch}
            onChange={(e) => setContactSearch(e.target.value)}
            className="customer-search-input"
          />
          {contactsLoading ? (
            <p className="search-status">Buscando...</p>
          ) : contacts.length > 0 ? (
            <ul className="dropdown">
              {contacts.map((c) => (
                <li key={c.id}>
                  <button type="button" className="dropdown-item" onClick={() => resolveContact(c)}>
                    {c.full_name}
                  </button>
                </li>
              ))}
            </ul>
          ) : contactSearch.length >= 2 ? (
            <p className="search-status">Sin resultados</p>
          ) : null}
          <button type="button" className="link-btn" onClick={() => setStep('newContact')}>
            + Crear nuevo cliente
          </button>
        </div>
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
            onCheckout={() => setStep('customer')}
          />
        </>
      )}

      <style>{`
        .page {
          max-width: 480px;
          margin: 0 auto;
          background: var(--refresh-bg, transparent);
        }
        .page-title {
          font-family: var(--refresh-font-display, inherit);
          color: var(--refresh-ink, var(--text-primary));
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
          background: var(--refresh-surface-glass, var(--surface-elevated));
          border: var(--refresh-border-hard, none);
          box-shadow: var(--refresh-shadow-hard-sm, none);
          border-radius: var(--refresh-radius-control, 8px);
          color: var(--refresh-ink, var(--text-primary));
          text-decoration: none;
        }
        .manual-order-service-list {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 1px;
          background: var(--border);
        }
        .customer-step {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 20px;
        }
        .section-title {
          font-size: 16px;
          font-weight: 600;
          color: var(--refresh-ink, var(--text-primary));
          margin: 0;
        }
        .customer-search-input {
          padding: 10px 12px;
          border: 1px solid var(--border);
          border-radius: 8px;
          font-size: 15px;
          color: var(--text-primary);
          background: var(--surface);
        }
        .search-status {
          font-size: 13px;
          color: var(--text-secondary);
          padding: 10px 4px;
        }
        .dropdown {
          list-style: none;
          border: 1px solid var(--border);
          border-radius: 8px;
          overflow: hidden;
          padding: 0;
          margin: 0;
        }
        .dropdown-item {
          display: block;
          width: 100%;
          padding: 12px 16px;
          text-align: left;
          font-size: 14px;
          background: var(--surface-elevated);
          cursor: pointer;
          border: none;
        }
        .dropdown-item:hover {
          background: var(--accent-subtle);
        }
        .link-btn {
          display: block;
          width: 100%;
          padding: 12px 0;
          text-align: left;
          font-size: 14px;
          color: var(--text-secondary);
          text-decoration: underline;
          background: none;
          border: none;
          cursor: pointer;
        }
        .field-error {
          color: var(--danger, #dc2626);
          font-size: 14px;
        }
      `}</style>
    </div>
  );
}
