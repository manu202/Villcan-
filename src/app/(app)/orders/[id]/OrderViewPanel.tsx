'use client';

import { useState } from 'react';
import {
  MessageCircle,
  User,
  Phone,
  Mail,
  ChevronRight,
  MapPin,
  Truck,
  CreditCard,
  ChevronDown,
  StickyNote,
  Pencil,
} from 'lucide-react';
import { formatGuaranies, parseGuaranies } from '@/lib/utils';
import { editConfirmedOrderDeliveryFee, cancelOrder } from '@/lib/data/orders';
import { useToast } from '@/contexts/ToastContext';
import { GuaraniesInput } from '@/components/GuaraniesInput';
import { ContactDetailSheet } from '@/components/ContactDetailSheet';
import {
  ORDER_STATUS_LABELS,
  type Order,
  type OrderItem,
  type OrderStatus,
} from '@/types';

const STATUS_OPTIONS: OrderStatus[] = ['pending', 'confirmed', 'completed', 'cancelled'];

// SW-O4/O-8: both RPCs raise their own ready-to-show Spanish error text
// (see the migrations' `raise exception '...' using errcode = 'VCxxx'`
// calls) — mirrored here verbatim rather than re-derived, following the
// same local-ERROR_COPY-per-call-site convention as
// orders/[id]/page.tsx's ERROR_COPY and OrderPaymentSheet's
// PAYMENT_ERROR_COPY (never show a raw Postgres message to the cashier).
const FEE_EDIT_ERROR_COPY: Record<string, string> = {
  VC400: 'Costo de delivery inválido.',
  VC403: 'No tenés permisos para editar este pedido.',
  VC404: 'Pedido no encontrado.',
  VC409: 'El pedido debe estar confirmado para editar el costo de delivery.',
};

const CANCEL_ERROR_COPY: Record<string, string> = {
  VC400: 'Se requiere un motivo de cancelación.',
  VC403: 'No tenés permisos para cancelar este pedido.',
  VC404: 'Pedido no encontrado.',
  VC409: 'No se puede cancelar un pedido completado o ya cancelado.',
};

function copyForError(copy: Record<string, string>, error: { code?: string } | null): string {
  if (!error) return 'Ocurrió un error. Intentá de nuevo.';
  return copy[error.code ?? ''] ?? 'Ocurrió un error. Intentá de nuevo.';
}

interface OrderViewPanelProps {
  order: Order;
  items: OrderItem[];
  contactSheetOpen: boolean;
  onContactSheetOpenChange: (open: boolean) => void;
  statusSubmitting: boolean;
  onStatusChange: (status: OrderStatus) => void;
  onNotify: () => void;
  /** Called after a successful fee edit or cancellation so the parent can
   *  refetch the order (same refetchOrderAfterWrite the parent already
   *  uses for status changes/payment completion). */
  onOrderUpdated: () => void;
}

export function OrderViewPanel({
  order,
  items,
  contactSheetOpen,
  onContactSheetOpenChange,
  statusSubmitting,
  onStatusChange,
  onNotify,
  onOrderUpdated,
}: OrderViewPanelProps) {
  const { showToast } = useToast();

  const [showFeeForm, setShowFeeForm] = useState(false);
  const [feeInput, setFeeInput] = useState('');
  const [feeSubmitting, setFeeSubmitting] = useState(false);

  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  const canEditFee = order.status === 'confirmed' && order.delivery_type === 'delivery';
  const canCancel = order.status === 'pending' || order.status === 'confirmed';

  const openFeeForm = () => {
    setFeeInput(order.delivery_fee != null ? String(order.delivery_fee) : '');
    setShowFeeForm(true);
  };

  const handleFeeConfirm = async () => {
    const fee = parseGuaranies(feeInput);
    if (fee < 0 || feeSubmitting) return;
    setFeeSubmitting(true);
    const { error } = await editConfirmedOrderDeliveryFee(order.id, fee);
    setFeeSubmitting(false);
    if (error) {
      showToast(copyForError(FEE_EDIT_ERROR_COPY, error), 'error');
      return;
    }
    setShowFeeForm(false);
    onOrderUpdated();
  };

  const handleCancelConfirm = async () => {
    if (!cancelReason.trim() || cancelSubmitting) return;
    setCancelSubmitting(true);
    const { error } = await cancelOrder(order.id, cancelReason.trim());
    setCancelSubmitting(false);
    if (error) {
      showToast(copyForError(CANCEL_ERROR_COPY, error), 'error');
      return;
    }
    setShowCancelForm(false);
    setCancelReason('');
    onOrderUpdated();
  };
  return (
    <>
      {/* Status control row */}
      <div className="order-control-row">
        <div className="status-pill-wrap">
          <select
            className={`status-pill status-${order.status}`}
            value={order.status}
            onChange={(e) => onStatusChange(e.target.value as OrderStatus)}
            aria-label="Estado del pedido"
            disabled={statusSubmitting}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>
            ))}
          </select>
          <ChevronDown size={11} className="status-chevron" aria-hidden="true" />
        </div>
        <button type="button" className="whatsapp-btn" onClick={onNotify}>
          <MessageCircle size={15} />
          Notificar cliente
        </button>
      </div>

      {/* Cancelar con motivo — real cancel_order RPC (O-8). Kept as a
          separate, secondary control alongside the status <select>'s own
          "Cancelado" option (which still calls onStatusChange('cancelled')
          → updateOrderStatus, unguarded reason) — this one is the richer
          audited path, recording who/when/why. Only shown while the order
          is still pending/confirmed (the RPC itself also rejects a
          completed/cancelled order with VC409). */}
      {canCancel && (
        <div className="cancel-reason-row">
          {!showCancelForm ? (
            <button
              type="button"
              className="cancel-reason-btn"
              onClick={() => setShowCancelForm(true)}
            >
              Cancelar con motivo
            </button>
          ) : (
            <div className="cancel-reason-form">
              <label className="cancel-reason-label" htmlFor="cancel-reason-input">
                Motivo de la cancelación
              </label>
              <textarea
                id="cancel-reason-input"
                className="cancel-reason-textarea"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Ej: el cliente canceló por teléfono"
                rows={3}
                disabled={cancelSubmitting}
              />
              <div className="cancel-reason-actions">
                <button
                  type="button"
                  className="cancel-reason-cancel"
                  onClick={() => { setShowCancelForm(false); setCancelReason(''); }}
                  disabled={cancelSubmitting}
                >
                  Volver
                </button>
                <button
                  type="button"
                  className="cancel-reason-confirm"
                  onClick={handleCancelConfirm}
                  disabled={!cancelReason.trim() || cancelSubmitting}
                >
                  {cancelSubmitting ? 'Cancelando...' : 'Confirmar cancelación'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Cliente */}
      <div className="detail-card">
        <div className="detail-card-label">Cliente</div>
        <div className="detail-card-body">
          <div className="customer-name">{order.customer_name}</div>
          {order.customer_phone && (
            <div className="customer-meta">
              <Phone size={13} className="meta-icon" />
              <span>{order.customer_phone}</span>
            </div>
          )}
          {order.customer_email && (
            <div className="customer-meta">
              <Mail size={13} className="meta-icon" />
              <span>{order.customer_email}</span>
            </div>
          )}
          {order.contact_id && (
            <>
              <button
                type="button"
                className="contact-pill"
                onClick={() => onContactSheetOpenChange(true)}
              >
                <User size={13} />
                <span>Ver contacto vinculado</span>
                <ChevronRight size={13} />
              </button>
              <ContactDetailSheet
                contactId={order.contact_id}
                open={contactSheetOpen}
                onOpenChange={onContactSheetOpenChange}
                onEdit={() => onContactSheetOpenChange(false)}
              />
            </>
          )}
        </div>
      </div>

      {/* Items */}
      <div className="detail-card">
        <div className="detail-card-label">Items</div>
        <ul className="items-list">
          {items.map((item) => (
            <li key={item.id} className="item-row">
              <div className="item-left">
                <span className="item-qty">{item.qty}×</span>
                <span className="item-name">{item.name_snapshot}</span>
              </div>
              <span className="item-total">{formatGuaranies(item.line_total)}</span>
            </li>
          ))}
        </ul>
        <div className="grand-total-row">
          <span>Total</span>
          <strong>
            {formatGuaranies(
              order.total + (order.delivery_type === 'delivery' ? (order.delivery_fee ?? 0) : 0)
            )}
          </strong>
        </div>
      </div>

      {/* Entrega & Pago */}
      <div className="detail-card">
        <div className="detail-card-label">Entrega & Pago</div>
        <div className="detail-card-body detail-row-group">
          <div className="detail-info-row">
            <Truck size={15} className="info-icon" />
            <span>
              {order.delivery_type === 'delivery'
                ? `Delivery${order.delivery_address ? ` — ${order.delivery_address}` : ''}`
                : 'Retiro en el local'}
            </span>
          </div>
          {order.delivery_type === 'delivery' && order.delivery_location && (
            <a
              href={`https://www.google.com/maps?q=${order.delivery_location.lat},${order.delivery_location.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="detail-info-row maps-link"
            >
              <MapPin size={15} className="info-icon" />
              <span>Ver ubicación en Maps</span>
            </a>
          )}
          {order.delivery_type === 'delivery' && order.delivery_fee != null && !showFeeForm && (
            <div className="detail-info-row fee-row">
              <Truck size={15} className="info-icon" style={{ opacity: 0 }} aria-hidden="true" />
              <span className="delivery-fee-badge">Delivery: {formatGuaranies(order.delivery_fee)}</span>
              {/* SW-O4: edit_confirmed_order_delivery_fee — only while
                  confirmed (the RPC itself also rejects any other status
                  with VC409); a pending order sets its fee for the first
                  time via confirm_order_delivery_fee elsewhere, not here. */}
              {canEditFee && (
                <button
                  type="button"
                  className="fee-edit-btn"
                  onClick={openFeeForm}
                  aria-label={`Editar fee de delivery (actual: ${formatGuaranies(order.delivery_fee)})`}
                >
                  <span className="fee-edit-visual">
                    <Pencil size={13} aria-hidden="true" />
                  </span>
                </button>
              )}
            </div>
          )}

          {showFeeForm && (
            <div className="fee-edit-form">
              <label className="fee-edit-label" htmlFor="fee-edit-input">
                Nuevo costo de delivery
              </label>
              <GuaraniesInput
                id="fee-edit-input"
                className="fee-edit-input"
                value={feeInput}
                onChange={setFeeInput}
                disabled={feeSubmitting}
              />
              <div className="fee-edit-actions">
                <button
                  type="button"
                  className="fee-edit-cancel"
                  onClick={() => setShowFeeForm(false)}
                  disabled={feeSubmitting}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="fee-edit-confirm"
                  onClick={handleFeeConfirm}
                  disabled={feeSubmitting}
                >
                  {feeSubmitting ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          )}
          <div className="detail-info-row">
            <CreditCard size={15} className="info-icon" />
            <span>{order.payment_method === 'efectivo' ? 'Efectivo' : 'Transferencia'}</span>
          </div>
        </div>
      </div>

      {/* Nota */}
      {order.note && (
        <div className="detail-card">
          <div className="detail-card-label">Nota</div>
          <div className="detail-card-body">
            <div className="order-note">
              <StickyNote size={13} className="info-icon" />
              <span>{order.note}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
