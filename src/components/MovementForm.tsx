'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { MovementType, PaymentMethod, Service, Contact } from '@/types';
import { parseGuaranies, escapeSearchQuery } from '@/lib/utils';
import { ContactForm } from './ContactForm';
import { TypeStep } from './movement-form/TypeStep';
import { CatalogStep } from './movement-form/CatalogStep';
import { PaymentStep } from './movement-form/PaymentStep';
import { DetailsStep } from './movement-form/DetailsStep';
import { fuentes } from './movement-form/shared';
import type { CartLine } from './storefront/CartSheet';
import { createClient } from '@/lib/supabase/client';
import { getCurrentUserId } from '@/lib/auth';
import { useBranch } from '@/contexts/BranchContext';

interface MovementFormProps {
  initialType?: MovementType;
  showToast?: (message: string, type?: 'success' | 'error') => void;
}

type FormStep = 'type' | 'catalog' | 'payment' | 'details';

// Spanish copy for known error codes MovementForm's inserts/RPC calls can
// return, mirroring the ERROR_COPY/copyForError convention used in
// src/app/(app)/orders/[id]/page.tsx. Never shows a raw Postgres/Supabase
// message to the cashier.
const ERROR_COPY: Record<string, string> = {
  VC400: 'Revisá los datos ingresados.',
  VC403: 'No tenés permisos para registrar este movimiento.',
  VC404: 'Sucursal o servicio no encontrado.',
  VC409: 'Uno de los servicios ya no está disponible.',
  VC429: 'Demasiados pedidos, esperá un minuto.',
  '42501': 'No tenés permisos para registrar este movimiento.',
  PGRST301: 'No tenés permisos para registrar este movimiento.',
};

function copyForError(error: { code?: string; message?: string } | null): string {
  if (!error) return 'Ocurrió un error. Intentá de nuevo.';
  return ERROR_COPY[error.code ?? ''] ?? 'Ocurrió un error. Intentá de nuevo.';
}

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
  // Synchronous double-submission guard (SW-M2): a ref updates immediately,
  // unlike `isSubmitting` state which only takes effect on the next render —
  // that gap is exactly what lets a fast double-tap fire handleSubmit twice
  // before the `disabled` prop re-renders. Checked/set at the very start of
  // handleSubmit, in addition to (not instead of) `isSubmitting`.
  const isSubmittingRef = useRef(false);
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
    // Synchronous lock (SW-M2): checked/set immediately, before the async
    // gap that `isSubmitting` state alone can't close (state only takes
    // effect on the next render, which a fast double-tap can beat).
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsSubmitting(true);

    const finish = () => {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    };

    const userId = await getCurrentUserId();
    if (!userId) {
      alert('Debes estar logueado para registrar movimientos');
      finish();
      return;
    }

    const branchId = currentBranch?.id;
    if (!currentBranch) {
      alert('Debes seleccionar una sucursal');
      finish();
      return;
    }

    const supabase = createClient();

    // Ventas → pending order (appears in KDS); movement created by trigger on completion
    if (type === 'servicio') {
      // SW-M1: 'pos' is now a valid orders.payment_method value end to end
      // (see 20260922050000_pos_payment_method_and_closing_overlap_guard.sql)
      // — no longer coerced to 'efectivo', which used to inflate recorded
      // cash and guarantee arqueo mismatches for card sales.
      const rpcPaymentMethod: PaymentMethod = paymentMethod || 'efectivo';

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
        showToast?.(copyForError(orderError), 'error');
        finish();
        return;
      }

      finish();
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
      showToast?.(copyForError(error), 'error');
      finish();
      return;
    }

    finish();
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

  const isValid = () => {
    if (!type) return false;
    if (type === 'servicio') return cartLines.length > 0 && !!paymentMethod;
    if (type === 'gasto') return parseGuaranies(income) > 0 && !!fuente;
    return parseGuaranies(income) > 0;
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
    return <TypeStep onBack={handleBack} onSelectType={handleTypeSelect} />;
  }

  // Step 2: Catalog (servicio only)
  if (step === 'catalog') {
    return (
      <CatalogStep
        onBack={handleBack}
        servicesLoading={servicesLoading}
        servicesError={servicesError}
        services={services}
        cart={cart}
        onAdd={addToCart}
        cartLines={cartLines}
        onIncrement={incrementCart}
        onDecrement={decrementCart}
        onCheckout={() => setStep('payment')}
        showDiscardConfirm={showDiscardConfirm}
        onConfirmDiscard={handleConfirmDiscard}
        onCancelDiscard={handleCancelDiscard}
      />
    );
  }

  // Step 3: Payment (servicio only)
  if (step === 'payment') {
    return (
      <PaymentStep
        onBack={handleBack}
        cartLines={cartLines}
        cartTotal={cartTotal}
        onSubmit={handleSubmit}
        selectedContact={selectedContact}
        onClearContact={() => { setSelectedContact(null); setContactSearch(''); }}
        contactSearch={contactSearch}
        onContactSearchChange={setContactSearch}
        contactsLoading={contactsLoading}
        contacts={contacts}
        onSelectContact={(c) => { setSelectedContact(c); setContactSearch(c.full_name); setContacts([]); }}
        onShowNewContact={() => setShowNewContact(true)}
        attempted={attempted}
        paymentMethod={paymentMethod}
        onSelectPaymentMethod={handlePaymentMethodSelect}
        isSubmitting={isSubmitting}
      />
    );
  }

  // Step 4: Details (gasto / apertura / cierre)
  return (
    <DetailsStep
      onBack={handleBack}
      type={type}
      comment={comment}
      onCommentChange={setComment}
      income={income}
      onIncomeChange={setIncome}
      attempted={attempted}
      fuente={fuente}
      onFuenteChange={setFuente}
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      showDiscardConfirm={showDiscardConfirm}
      onConfirmDiscard={handleConfirmDiscard}
      onCancelDiscard={handleCancelDiscard}
    />
  );
}
