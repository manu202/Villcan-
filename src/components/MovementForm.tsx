'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { MovementType, PaymentMethod, Service, Contact } from '@/types';
import { formatGuaranies, parseGuaranies, escapeSearchQuery } from '@/lib/utils';
import { ContactForm } from './ContactForm';
import { ConfirmModal } from './ConfirmModal';
import { createClient } from '@/lib/supabase/client';
import { getCurrentUserId } from '@/lib/auth';
import { useBranch } from '@/contexts/BranchContext';
import { useSettings } from '@/contexts/SettingsContext';
import { computeCommissionPct } from '@/lib/commission';

interface MovementFormProps {
  initialType?: MovementType;
  showToast?: (message: string, type?: 'success' | 'error') => void;
}

type FormStep = 'type' | 'details';

const movementTypes: { value: MovementType; label: string; description: string }[] = [
  { value: 'servicio', label: 'Servicio', description: 'Venta de servicio' },
  { value: 'gasto', label: 'Gasto', description: 'Egreso de dinero' },
  { value: 'apertura', label: 'Apertura', description: 'Capital inicial del turno' },
  { value: 'cierre', label: 'Cierre', description: 'Extracción de caja' },
];

const paymentMethods: { value: PaymentMethod; label: string }[] = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'pos', label: 'POS' },
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
  const { settings } = useSettings();
  const [step, setStep] = useState<FormStep>(initialType ? 'details' : 'type');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showNewContact, setShowNewContact] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  // Form state
  const [type, setType] = useState<MovementType | ''>(initialType || '');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('');
  const [amountCharged, setAmountCharged] = useState('');
  const [income, setIncome] = useState('');
  const [fuente, setFuente] = useState<typeof fuentes[number] | ''>('');
  const [comment, setComment] = useState('');

  // For servicio
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [contactSearch, setContactSearch] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [services, setServices] = useState<Service[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);

  // Calculated change for efectivo
  const amountChargedNum = parseGuaranies(amountCharged);
  const incomeNum = parseGuaranies(income);
  const change = paymentMethod === 'efectivo' && incomeNum > amountChargedNum
    ? incomeNum - amountChargedNum
    : 0;

  // Load services from Supabase
  useEffect(() => {
    const loadServices = async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('services')
        .select('id, name, price')
        .eq('is_active', true)
        .order('name');

      if (!error && data) {
        setServices(data as Service[]);
      }
    };
    loadServices();
  }, []);

  // Load contacts from Supabase on search
  useEffect(() => {
    let cancelled = false;

    if (contactSearch.length >= 2) {
      const searchContacts = async () => {
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
      };
      searchContacts();
    } else {
      Promise.resolve().then(() => {
        if (!cancelled) {
          setContacts([]);
          setContactsLoading(false);
        }
      });
    }

    return () => {
      cancelled = true;
    };
  }, [contactSearch]);

  const handleTypeSelect = (t: MovementType) => {
    setType(t);
    setStep('details');
  };

  const handleServiceSelect = (servicePrice: number) => {
    setAmountCharged(servicePrice.toString());
    // For transferencia/POS, auto-fill income with price
    if (paymentMethod === 'transferencia' || paymentMethod === 'pos') {
      setIncome(servicePrice.toString());
    }
  };

  const handlePaymentMethodSelect = (method: PaymentMethod) => {
    setPaymentMethod(method);
    // Auto-fill income for non-cash methods
    if ((method === 'transferencia' || method === 'pos') && amountCharged) {
      setIncome(amountCharged);
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
    const amountChargedNum = parseGuaranies(amountCharged);
    const incomeNum = parseGuaranies(income); // this is "Dinero recibido" or "Monto" depending on type

    let finalIncome = 0;
    let finalExpense = 0;

    if (type === 'servicio') {
      // income = actual cash received (net of change for efectivo)
      // expense = the change/vuelto given back
      finalIncome = paymentMethod === 'efectivo' 
        ? incomeNum - (change > 0 ? parseGuaranies(change.toString()) : 0)
        : amountChargedNum;
      finalExpense = change > 0 ? parseGuaranies(change.toString()) : 0;
    } else if (type === 'gasto') {
      // income = 0 (no cash came in)
      // expense = the amount spent (goes out)
      finalIncome = 0;
      finalExpense = incomeNum;
    } else {
      // apertura/cierre: the amount entered IS the income
      finalIncome = incomeNum;
      finalExpense = 0;
    }

    // Build comment with fuente for gastos
    const finalComment = buildFinalComment(type, fuente, comment);

    const movementData: Record<string, unknown> = {
      type,
      income: finalIncome,
      expense: finalExpense,
      comment: finalComment,
      user_id: userId,
      branch_id: branchId,
      created_at: new Date().toISOString(),
    };

    if (type === 'servicio') {
      movementData.contact_id = selectedContact?.id || null;
      movementData.service_id = serviceId || null;
      movementData.payment_method = paymentMethod || null;
      movementData.amount_charged = amountChargedNum;
      movementData.commission_pct = computeCommissionPct(settings);
    }

    const { error } = await supabase
      .from('movements')
      .insert(movementData);

    if (error) {
      console.error('Error inserting movement:', error);
      alert('Error al registrar movimiento');
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);

    if (showToast) {
      showToast('Movimiento registrado', 'success');
    }

    setTimeout(() => {
      router.push('/movements');
    }, 500);
  };

  const isDirty = !!selectedContact || !!contactSearch || !!serviceId || !!amountCharged
    || !!income || !!fuente || !!comment || !!paymentMethod;

  const handleBack = () => {
    if (step === 'details') {
      if (isDirty) {
        setShowDiscardConfirm(true);
        return;
      }
      setStep('type');
    } else if (type) {
      // Already in type selection, go back to movements
      router.push('/movements');
    }
  };

  const handleConfirmDiscard = () => {
    setShowDiscardConfirm(false);
    setSelectedContact(null);
    setContactSearch('');
    setServiceId('');
    setAmountCharged('');
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
            background: var(--gray-100);
            border-radius: 8px;
            color: var(--black);
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
            color: var(--gray-400);
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
            background: var(--white);
            border: 1px solid var(--gray-200);
            border-radius: 12px;
            text-align: left;
            cursor: pointer;
            transition: all 0.15s ease;
          }

          .type-card:hover {
            border-color: var(--black);
          }

          .type-card:active {
            background: var(--gray-50);
            border-color: var(--black);
          }

          .type-card:focus-visible {
            outline: 2px solid var(--black);
            outline-offset: 2px;
          }

          .type-label {
            font-size: 16px;
            font-weight: 600;
            color: var(--black);
          }

          .type-desc {
            font-size: 12px;
            color: var(--gray-500);
          }
        `}</style>
      </div>
    );
  }

  // Step 2: Details form
  const isValid = () => {
    if (!type) return false;
    if (type === 'servicio') {
      return !!selectedContact && !!serviceId && !!paymentMethod && parseGuaranies(income) > 0;
    }
    if (type === 'gasto') {
      return parseGuaranies(income) > 0;
    }
    return parseGuaranies(income) > 0;
  };

  return (
    <div className="page">
      <header className="page-header flex-header">
        <button onClick={handleBack} className="back-btn">←</button>
        <h1 className="page-title">Nuevo {type && movementTypes.find(t => t.value === type)?.label}</h1>
      </header>

      <form onSubmit={handleSubmit}>
        {/* SERVICIO */}
        {type === 'servicio' && (
          <>
            <section className="section">
              <h2 className="section-title">Cliente</h2>
              {selectedContact ? (
                <div className="selected-contact">
                  <span className="contact-name">{selectedContact.full_name}</span>
                  <button
                    type="button"
                    className="clear-btn"
                    onClick={() => {
                      setSelectedContact(null);
                      setContactSearch('');
                    }}
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
                            onClick={() => {
                              setSelectedContact(c);
                              setContactSearch(c.full_name);
                              setContacts([]);
                            }}
                          >
                            {c.full_name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : contactSearch.length >= 2 ? (
                    <p className="search-status">Sin resultados</p>
                  ) : null}
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => setShowNewContact(true)}
                  >
                    + Crear nuevo cliente
                  </button>
                </>
              )}
            </section>

            <section className="section">
              <h2 className="section-title">Servicio</h2>
              <div className="service-grid">
                {services.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setServiceId(s.id);
                      handleServiceSelect(s.price);
                    }}
                    className={`service-btn ${serviceId === s.id ? 'selected' : ''}`}
                  >
                    <span className="service-name">{s.name}</span>
                    <span className="service-price">{formatGuaranies(s.price)}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="section">
              <h2 className="section-title">Método de pago</h2>
              <div className="method-grid">
                {paymentMethods.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => handlePaymentMethodSelect(m.value)}
                    className={`method-btn ${paymentMethod === m.value ? 'selected' : ''}`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </section>

            {paymentMethod === 'efectivo' && (
              <>
                <section className="section">
                  <h2 className="section-title">Dinero recibido</h2>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    value={income}
                    onChange={(e) => setIncome(e.target.value)}
                    className="input input-lg"
                  />
                </section>

                {change > 0 && (
                  <section className="section">
                    <div className="change-box">
                      <span className="change-label">Vuelto</span>
                      <span className="change-value">{formatGuaranies(change)}</span>
                    </div>
                  </section>
                )}
              </>
            )}
          </>
        )}

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
              <h2 className="section-title">Origen</h2>
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
            disabled={!isValid() || isSubmitting}
            className="btn-primary btn-full"
          >
            {isSubmitting ? 'Guardando...' : 'Registrar movimiento'}
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
          background: var(--gray-100);
          border-radius: 8px;
          color: var(--black);
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
          color: var(--gray-400);
          margin-bottom: 12px;
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
          color: var(--gray-500);
          margin-top: 8px;
        }

        .selected-contact {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 16px;
          background: var(--gray-50);
          border: 1px solid var(--gray-200);
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
          color: var(--gray-400);
        }

        .search-status {
          font-size: 13px;
          color: var(--gray-500);
          padding: 10px 4px;
        }

        .link-btn {
          display: block;
          width: 100%;
          padding: 12px 0;
          text-align: left;
          font-size: 14px;
          color: var(--gray-600);
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
          background: var(--white);
          border: 1px solid var(--gray-200);
          border-radius: 8px;
          text-align: left;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .service-btn:hover {
          border-color: var(--gray-400);
        }

        .service-btn:active {
          background: var(--gray-50);
          border-color: var(--black);
        }

        .service-btn:focus-visible {
          outline: 2px solid var(--black);
          outline-offset: 2px;
        }

        .service-btn.selected {
          border-color: var(--black);
          background: var(--gray-50);
        }

        .service-name {
          font-size: 14px;
          font-weight: 500;
          color: var(--black);
        }

        .service-price {
          font-size: 12px;
          color: var(--gray-500);
        }

        .method-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
        }

        .method-btn {
          padding: 16px 12px;
          background: var(--white);
          border: 1px solid var(--gray-200);
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          color: var(--gray-600);
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .method-btn:hover {
          border-color: var(--gray-400);
        }

        .method-btn:active {
          background: var(--gray-50);
          border-color: var(--black);
        }

        .method-btn:focus-visible {
          outline: 2px solid var(--black);
          outline-offset: 2px;
        }

        .method-btn.selected {
          border-color: var(--black);
          background: var(--black);
          color: var(--white);
        }

        .change-box {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px;
          background: var(--gray-50);
          border: 1px solid var(--gray-200);
          border-radius: 12px;
        }

        .change-label {
          font-size: 14px;
          font-weight: 500;
          color: var(--gray-600);
        }

        .change-value {
          font-size: 20px;
          font-weight: 700;
          color: var(--black);
        }

        .btn-primary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 14px 24px;
          background: var(--black);
          color: var(--white);
          border: none;
          border-radius: 8px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: opacity 0.15s ease;
          min-height: 48px;
          width: 100%;
        }

        .btn-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .dropdown {
          list-style: none;
          border: 1px solid var(--gray-200);
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
          background: var(--white);
          cursor: pointer;
        }

        .dropdown-item:hover {
          background: var(--gray-50);
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