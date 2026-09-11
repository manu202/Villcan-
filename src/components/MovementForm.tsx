'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShoppingCart,
  Receipt,
  Unlock,
  Lock,
  Banknote,
  ArrowLeftRight,
  CreditCard,
  type LucideIcon,
} from 'lucide-react';
import type { MovementType, PaymentMethod, Service, Contact } from '@/types';
import { formatGuaranies, parseGuaranies, escapeSearchQuery } from '@/lib/utils';
import { ContactForm } from './ContactForm';
import { ConfirmModal } from './ConfirmModal';
import { ServiceCard } from './storefront/ServiceCard';
import { CartSheet, type CartLine } from './storefront/CartSheet';
import { createClient } from '@/lib/supabase/client';
import { getCurrentUserId } from '@/lib/auth';
import { useBranch } from '@/contexts/BranchContext';

interface MovementFormProps {
  initialType?: MovementType;
  showToast?: (message: string, type?: 'success' | 'error') => void;
}

type FormStep = 'type' | 'catalog' | 'payment' | 'details';

const movementTypes: { value: MovementType; label: string; description: string; icon: LucideIcon }[] = [
  { value: 'servicio', label: 'Venta', description: 'Cobro de servicio o producto', icon: ShoppingCart },
  { value: 'gasto', label: 'Gasto', description: 'Egreso de dinero', icon: Receipt },
  { value: 'apertura', label: 'Apertura', description: 'Capital inicial del turno', icon: Unlock },
  { value: 'cierre', label: 'Retiro', description: 'Extracción de caja', icon: Lock },
];

const MOVEMENT_TITLES: Record<MovementType, string> = {
  servicio: 'Nueva Venta',
  gasto: 'Nuevo Gasto',
  apertura: 'Apertura de Caja',
  cierre: 'Retiro de Caja',
};

const SUBMIT_LABELS: Record<MovementType, string> = {
  servicio: 'Registrar venta',
  gasto: 'Registrar gasto',
  apertura: 'Abrir caja',
  cierre: 'Registrar retiro',
};

const paymentMethods: { value: PaymentMethod; label: string; icon: LucideIcon }[] = [
  { value: 'efectivo', label: 'Efectivo', icon: Banknote },
  { value: 'transferencia', label: 'Transferencia', icon: ArrowLeftRight },
  { value: 'pos', label: 'POS', icon: CreditCard },
];

const fuentes = ['Caja', 'Cta Bancaria'] as const;

/**
 * Builds the final `comment` value persisted on a movement.
 * For `gasto` movements with a selected `fuente`, the fuente is appended
 * as a bracketed suffix (e.g. "Alquiler [Cta Bancaria]"), which is how
 * src/app/page.tsx's balanceEfectivo filter identifies bank-account gastos.
 * Extracted as a pure function so it can be unit tested independent of
 * the (fuente-less) `servicio`/`apertura`/`cierre` UI paths.
 */
export function buildFinalComment(
  type: MovementType | '',
  fuente: string,
  comment: string
): string | null {
  let finalComment: string | null = comment.trim() || null;
  if (type === 'gasto' && fuente) {
    finalComment = finalComment ? `${finalComment} [${fuente}]` : `[${fuente}]`;
  }
  return finalComment;
}

export function MovementForm({ initialType, showToast }: MovementFormProps) {
  const router = useRouter();
  const { currentBranch } = useBranch();
  const [step, setStep] = useState<FormStep>(
    initialType ? (initialType === 'servicio' ? 'catalog' : 'details') : 'type'
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showNewContact, setShowNewContact] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [attempted, setAttempted] = useState(false);

  // Form state
  const [type, setType] = useState<MovementType | ''>(initialType || '');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('');
  const [income, setIncome] = useState('');
  const [fuente, setFuente] = useState<typeof fuentes[number] | ''>('');
  const [comment, setComment] = useState('');

  // Cart state (for servicio catalog flow)
  const [cart, setCart] = useState<Record<string, number>>({});

  // For servicio
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [contactSearch, setContactSearch] = useState('');
  const [services, setServices] = useState<Service[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);

  // Cart helpers
  const cartLines: CartLine[] = services
    .filter((s) => (cart[s.id] ?? 0) > 0)
    .map((s) => ({ service: s, qty: cart[s.id] }));

  const cartTotal = cartLines.reduce((sum, l) => sum + l.service.price * l.qty, 0);

  const addToCart = (service: Service) => {
    setCart((prev) => ({ ...prev, [service.id]: (prev[service.id] ?? 0) + 1 }));
  };
  const incrementCart = (serviceId: string) => {
    setCart((prev) => ({ ...prev, [serviceId]: (prev[serviceId] ?? 0) + 1 }));
  };
  const decrementCart = (serviceId: string) => {
    setCart((prev) => {
      const next = { ...prev };
      const qty = (next[serviceId] ?? 0) - 1;
      if (qty <= 0) delete next[serviceId];
      else next[serviceId] = qty;
      return next;
    });
  };

  // Load services from Supabase — branch-specific + global (branch_id IS NULL)
  useEffect(() => {
    if (!currentBranch) return;
    const loadServices = async () => {
      setServicesLoading(true);
      setServicesError(null);
      const supabase = createClient();
      const { data, error } = await supabase
        .from('services')
        .select('id, name, price')
        .eq('is_active', true)
        .eq('is_available', true)
        .or(`branch_id.eq.${currentBranch.id},branch_id.is.null`)
        .order('name');

      if (error) {
        setServicesError(error.message);
      } else if (data) {
        setServices(data as Service[]);
      }
      setServicesLoading(false);
    };
    loadServices();
  }, [currentBranch]);

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load contacts from Supabase on search (A5: 300ms debounce to avoid a
  // query on every keystroke).
  useEffect(() => {
    let cancelled = false;

    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    if (contactSearch.length >= 2) {
      searchDebounceRef.current = setTimeout(async () => {
        setContactsLoading(true);
        const supabase = createClient();
        const escaped = escapeSearchQuery(contactSearch);
        const { data } = await supabase
          .from('contacts')
          .select('id, full_name')
          .ilike('full_name', `%${escaped}%`)
          .order('full_name')
          .limit(10);

        if (cancelled) return;

        if (data) {
          setContacts(data as Contact[]);
        }
        setContactsLoading(false);
      }, 300);
    } else {
      setContacts([]);
      setContactsLoading(false);
    }

    return () => {
      cancelled = true;
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [contactSearch]);

  const handleTypeSelect = (t: MovementType) => {
    setType(t);
    setStep(t === 'servicio' ? 'catalog' : 'details');
  };

  const handlePaymentMethodSelect = (method: PaymentMethod) => {
    setPaymentMethod(method);
    // Auto-fill income for non-cash methods in non-servicio types
    if ((method === 'transferencia' || method === 'pos') && income) {
      setIncome(income);
    }
  };

  const handleContactCreated = (contact: { id: string; full_name: string }) => {
    setSelectedContact(contact as Contact);
    setContactSearch(contact.full_name);
    setShowNewContact(false);
    setContacts([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid()) {
      setAttempted(true);
      return;
    }
    setIsSubmitting(true);

    const userId = await getCurrentUserId();
    if (!userId) {
      alert('Debes estar logueado para registrar movimientos');
      setIsSubmitting(false);
      return;
    }

    const branchId = currentBranch?.id;
    if (!currentBranch) {
      alert('Debes seleccionar una sucursal');
      setIsSubmitting(false);
      return;
    }

    const supabase = createClient();

    // Ventas → pending order (appears in KDS); movement created by trigger on completion
    if (type === 'servicio') {
      const rpcPaymentMethod: 'efectivo' | 'transferencia' =
        paymentMethod === 'transferencia' ? 'transferencia' : 'efectivo';

      const { error: orderError } = await supabase.rpc('create_manual_order', {
        p_branch_id: branchId,
        p_customer_name: selectedContact?.full_name || 'Mostrador',
        p_customer_phone: selectedContact?.phone || '0000000',
        p_note: comment.trim() || null,
        p_items: cartLines.map((l) => ({ service_id: l.service.id, qty: l.qty })),
        p_payment_method: rpcPaymentMethod,
        p_delivery_type: 'pickup',
      });

      if (orderError) {
        showToast?.(orderError.message, 'error');
        setIsSubmitting(false);
        return;
      }

      setIsSubmitting(false);
      showToast?.('Pedido creado', 'success');
      setTimeout(() => router.push('/orders'), 500);
      return;
    }

    const incomeNum = parseGuaranies(income);
    let finalIncome = 0;
    let finalExpense = 0;

    if (type === 'gasto') {
      finalIncome = 0;
      finalExpense = incomeNum;
    } else if (type === 'apertura') {
      finalIncome = incomeNum;
      finalExpense = 0;
    } else {
      // cierre
      finalIncome = 0;
      finalExpense = incomeNum;
    }

    const finalComment = buildFinalComment(type, fuente, comment);

    const { error } = await supabase
      .from('movements')
      .insert({
        type,
        income: finalIncome,
        expense: finalExpense,
        comment: finalComment,
        user_id: userId,
        branch_id: branchId,
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      showToast?.(error.message, 'error');
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    showToast?.('Movimiento registrado', 'success');
    setTimeout(() => router.push('/movements'), 500);
  };

  const isDirty = Object.keys(cart).length > 0 || !!selectedContact || !!contactSearch
    || !!income || !!fuente || !!comment || !!paymentMethod;

  const handleBack = () => {
    if (step === 'payment') {
      setStep('catalog');
    } else if (step === 'catalog') {
      if (isDirty) {
        setShowDiscardConfirm(true);
        return;
      }
      setStep('type');
    } else if (step === 'details') {
      if (isDirty) {
        setShowDiscardConfirm(true);
        return;
      }
      setStep('type');
    } else {
      router.push('/movements');
    }
  };

  const handleConfirmDiscard = () => {
    setShowDiscardConfirm(false);
    setSelectedContact(null);
    setContactSearch('');
    setCart({});
    setIncome('');
    setFuente('');
    setComment('');
    setPaymentMethod('');
    setStep('type');
  };

  const handleCancelDiscard = () => {
    setShowDiscardConfirm(false);
  };

  // If showing new contact form
  if (showNewContact && type === 'servicio') {
    return (
      <div className="page">
        <header className="page-header">
          <button onClick={() => setShowNewContact(false)} className="back-btn">←</button>
          <h1 className="page-title">Nuevo Cliente</h1>
        </header>
        <ContactForm
          onCancel={() => setShowNewContact(false)}
          onSuccess={handleContactCreated}
        />
      </div>
    );
  }

  // Step 1: Type selection
  if (step === 'type') {
    return (
      <div className="page">
        <header className="page-header flex-header">
          <button onClick={handleBack} className="back-btn">←</button>
          <h1 className="page-title">Nuevo Movimiento</h1>
        </header>

        <section className="section">
          <h2 className="section-title">Seleccionar tipo</h2>
          <div className="type-grid">
            {movementTypes.map((t) => (
              <button
                key={t.value}
                onClick={() => handleTypeSelect(t.value)}
                className="type-card"
              >
                <t.icon size={20} className="type-icon" aria-hidden="true" />
                <span className="type-label">{t.label}</span>
                <span className="type-desc">{t.description}</span>
              </button>
            ))}
          </div>
        </section>

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
          }

          .page-title {
            font-size: 24px;
            font-weight: 700;
          }

          .section {
            margin-bottom: 24px;
          }

          .section-title {
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: var(--text-muted);
            margin-bottom: 12px;
          }

          .type-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
          }

          .type-card {
            display: flex;
            flex-direction: column;
            gap: 8px;
            padding: 20px;
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 12px;
            text-align: left;
            cursor: pointer;
            transition: all 0.15s ease;
            box-shadow: var(--shadow-sm);
          }

          .type-card:hover {
            border-color: var(--accent-hover);
          }

          .type-card:active {
            background: var(--accent-subtle);
            border-color: var(--accent-hover);
          }

          .type-card:focus-visible {
            outline: 2px solid var(--accent);
            outline-offset: 2px;
          }

          .type-icon {
            color: var(--text-secondary);
          }

          .type-label {
            font-size: 16px;
            font-weight: 600;
            color: var(--text-primary);
          }

          .type-desc {
            font-size: 12px;
            color: var(--text-secondary);
          }
        `}</style>
      </div>
    );
  }

  const isValid = () => {
    if (!type) return false;
    if (type === 'servicio') return cartLines.length > 0 && !!paymentMethod;
    if (type === 'gasto') return parseGuaranies(income) > 0 && !!fuente;
    return parseGuaranies(income) > 0;
  };

  // ── Catalog step (servicio only) ──────────────────────────────────────────
  if (step === 'catalog') {
    return (
      <div className="page page--catalog">
        <header className="page-header flex-header">
          <button onClick={handleBack} className="back-btn">←</button>
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
                onAdd={addToCart}
              />
            ))}
          </ul>
        )}

        <CartSheet
          lines={cartLines}
          onIncrement={incrementCart}
          onDecrement={decrementCart}
          onCheckout={() => setStep('payment')}
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
            onConfirm={handleConfirmDiscard}
            onCancel={handleCancelDiscard}
          />
        )}
      </div>
    );
  }

  // ── Payment step (servicio only) ──────────────────────────────────────────
  if (step === 'payment') {
    return (
      <div className="page">
        <header className="page-header flex-header">
          <button onClick={handleBack} className="back-btn">←</button>
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

        <form onSubmit={handleSubmit}>
          {/* Cliente (opcional) */}
          <section className="section">
            <h2 className="section-title">Cliente <span className="optional-mark">(opcional)</span></h2>
            {selectedContact ? (
              <div className="selected-contact">
                <span className="contact-name">{selectedContact.full_name}</span>
                <button
                  type="button"
                  className="clear-btn"
                  onClick={() => { setSelectedContact(null); setContactSearch(''); }}
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
                  onChange={(e) => setContactSearch(e.target.value)}
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
                          onClick={() => { setSelectedContact(c); setContactSearch(c.full_name); setContacts([]); }}
                        >
                          {c.full_name}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : contactSearch.length >= 2 ? (
                  <p className="search-status">Sin resultados</p>
                ) : null}
                <button type="button" className="link-btn" onClick={() => setShowNewContact(true)}>
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
                  onClick={() => handlePaymentMethodSelect(m.value)}
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

  // ── Details step (gasto / apertura / cierre) ──────────────────────────────
  return (
    <div className="page">
      <header className="page-header flex-header">
        <button onClick={handleBack} className="back-btn">←</button>
        <h1 className="page-title">{type ? MOVEMENT_TITLES[type] : 'Nuevo Movimiento'}</h1>
      </header>

      <form onSubmit={handleSubmit}>
        {/* SERVICIO — ya no llega aquí, se maneja en 'catalog'+'payment' */}

        {/* GASTO */}
        {type === 'gasto' && (
          <>
            <section className="section">
              <h2 className="section-title">Descripción</h2>
              <input
                type="text"
                placeholder="Descripción del gasto"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="input"
              />
            </section>

            <section className="section">
              <h2 className="section-title">Monto</h2>
              {attempted && parseGuaranies(income) <= 0 && (
                <p className="field-error">Ingresá el monto</p>
              )}
              <input
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={income}
                onChange={(e) => setIncome(e.target.value)}
                className="input input-lg"
              />
            </section>

            <section className="section">
              <h2 className="section-title">Origen <span className="required-mark">*</span></h2>
              {attempted && !fuente && (
                <p className="field-error">Seleccioná el origen del gasto</p>
              )}
              <div className="method-grid">
                {fuentes.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFuente(f)}
                    className={`method-btn ${fuente === f ? 'selected' : ''}`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </section>
          </>
        )}

        {/* APERTURA / CIERRE */}
        {(type === 'apertura' || type === 'cierre') && (
          <section className="section">
            <h2 className="section-title">Monto</h2>
            {attempted && parseGuaranies(income) <= 0 && (
              <p className="field-error">Ingresá el monto</p>
            )}
            <input
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={income}
              onChange={(e) => setIncome(e.target.value)}
              className="input input-lg"
            />
            <p className="input-hint">
              {type === 'apertura' ? 'Capital inicial para el turno' : 'Dinero a extraer/depositar'}
            </p>
          </section>
        )}

        <section className="section">
          <button
            type="submit"
            disabled={isSubmitting}
            className="btn-primary btn-full"
          >
            {isSubmitting ? 'Guardando...' : (type ? SUBMIT_LABELS[type] : 'Registrar')}
          </button>
        </section>
      </form>

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
        }

        .page-title {
          font-size: 24px;
          font-weight: 700;
        }

        .section {
          margin-bottom: 24px;
        }

        .section-title {
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted);
          margin-bottom: 12px;
        }

        .required-mark {
          color: var(--accent);
          font-size: 14px;
        }

        .input {
          width: 100%;
        }

        .input-lg {
          font-size: 24px;
          font-weight: 700;
          text-align: center;
          padding: 16px;
        }

        .input-hint {
          font-size: 12px;
          color: var(--text-secondary);
          margin-top: 8px;
        }

        .selected-contact {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 16px;
          background: var(--surface-elevated);
          border: 1px solid var(--border);
          border-radius: 8px;
        }

        .contact-name {
          font-size: 15px;
          font-weight: 500;
        }

        .clear-btn {
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          color: var(--text-muted);
        }

        .search-status {
          font-size: 13px;
          color: var(--text-secondary);
          padding: 10px 4px;
        }

        .link-btn {
          display: block;
          width: 100%;
          padding: 12px 0;
          text-align: left;
          font-size: 14px;
          color: var(--text-secondary);
          text-decoration: underline;
          margin-top: 8px;
        }

        .service-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }

        .service-btn {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 16px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 8px;
          text-align: left;
          cursor: pointer;
          transition: all 0.15s ease;
          box-shadow: var(--shadow-sm);
        }

        .service-btn:hover {
          border-color: var(--accent-hover);
        }

        .service-btn:active {
          background: var(--accent-subtle);
          border-color: var(--accent);
        }

        .service-btn:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
        }

        .service-btn.selected {
          border-color: var(--accent);
          background: var(--accent-subtle);
        }

        .service-icon {
          color: var(--text-secondary);
        }

        .service-name {
          font-size: 14px;
          font-weight: 500;
          color: var(--text-primary);
        }

        .service-price {
          font-size: 12px;
          color: var(--text-secondary);
        }

        .method-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
        }

        .method-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          padding: 16px 12px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .method-btn:hover {
          border-color: var(--accent-hover);
        }

        .method-btn:active {
          background: var(--accent-subtle);
          border-color: var(--accent);
        }

        .method-btn:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
        }

        .method-btn.selected {
          border-color: var(--accent);
          background: var(--accent);
          color: var(--accent-foreground);
        }

        .method-icon {
          color: inherit;
        }

        .change-box {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px;
          background: var(--surface-elevated);
          border: 1px solid var(--border);
          border-radius: 12px;
        }

        .change-label {
          font-size: 14px;
          font-weight: 500;
          color: var(--text-secondary);
        }

        .change-value {
          font-size: 20px;
          font-weight: 700;
          color: var(--text-primary);
        }

        .btn-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .field-error {
          font-size: 12px;
          color: #ef4444;
          margin-bottom: 8px;
          font-weight: 500;
        }

        .dropdown {
          list-style: none;
          border: 1px solid var(--border);
          border-radius: 8px;
          margin-top: 8px;
          overflow: hidden;
        }

        .dropdown-item {
          display: block;
          width: 100%;
          padding: 12px 16px;
          text-align: left;
          font-size: 14px;
          background: var(--surface-elevated);
          cursor: pointer;
        }

        .dropdown-item:hover {
          background: var(--accent-subtle);
        }
      `}</style>

      {showDiscardConfirm && (
        <ConfirmModal
          message="¿Descartar los datos ingresados?"
          onConfirm={handleConfirmDiscard}
          onCancel={handleCancelDiscard}
        />
      )}
    </div>
  );
}