'use client';

import { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { formatGuaranies, formatRelativeTime, isOlderThan } from '@/lib/utils';
import { buildStatusNotificationMessage, buildWhatsAppLink } from '@/lib/storefront';
import { ORDER_STATUS_LABELS, type OrderStatus, type OrderWithItems } from '@/types';
import { GuaraniesInput } from './GuaraniesInput';

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  pending: 'confirmed',
  confirmed: 'completed',
};

const ACTION_LABEL: Partial<Record<OrderStatus, string>> = {
  pending: 'Aceptar pedido',
  confirmed: 'Marcar completado',
};

const STATUS_COLORS: Record<OrderStatus, string> = {
  pending: 'badge-pending',
  confirmed: 'badge-confirmed',
  completed: 'badge-completed',
  cancelled: 'badge-cancelled',
};

interface OrderCardProps {
  order: OrderWithItems;
  onStatusChange: (orderId: string, status: OrderStatus, deliveryFee?: number) => void;
  onNotify: (order: OrderWithItems) => void;
  onClick: (orderId: string) => void;
  /** True while a status-change write for THIS order is in flight (SW-O10). */
  submitting?: boolean;
}

export function OrderCard({ order, onStatusChange, onNotify, onClick, submitting = false }: OrderCardProps) {
  const nextStatus = NEXT_STATUS[order.status];
  const actionLabel = ACTION_LABEL[order.status];
  const isUrgent = isOlderThan(order.created_at, 10) && order.status === 'pending';
  const itemsSummary = order.order_items
    .map((i) => `${i.qty}× ${i.name_snapshot}`)
    .join(', ');
  // SW-O2: totals must include the delivery fee, not just order.total.
  const grandTotal = order.total + (order.delivery_type === 'delivery' ? (order.delivery_fee ?? 0) : 0);

  const [showFeeForm, setShowFeeForm] = useState(false);
  // Raw digit string from GuaraniesInput (SW-O3: parseInt on a raw number
  // input mis-parsed Paraguayan-formatted values like "15.000" -> 15).
  const [feeDigits, setFeeDigits] = useState('');

  const handleAdvance = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!nextStatus) return;
    if (order.delivery_type === 'delivery' && nextStatus === 'confirmed') {
      setShowFeeForm(true);
    } else {
      onStatusChange(order.id, nextStatus, undefined);
    }
  };

  const handleFeeConfirm = (e: React.MouseEvent) => {
    e.stopPropagation();
    onStatusChange(order.id, 'confirmed', parseInt(feeDigits, 10) || 0);
    setShowFeeForm(false);
    setFeeDigits('');
  };

  const handleFeeCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowFeeForm(false);
    setFeeDigits('');
  };

  const handleNotify = (e: React.MouseEvent) => {
    e.stopPropagation();
    onNotify(order);
  };

  return (
    <li
      className="kds-card"
      data-testid={`order-card-${order.id}`}
      data-urgent={isUrgent ? 'true' : undefined}
      onClick={() => onClick(order.id)}
    >
      {/* Header */}
      <div className="kds-header">
        <span className="kds-code">#{order.order_code}</span>
        <span className={`kds-badge ${STATUS_COLORS[order.status]}`}>
          {ORDER_STATUS_LABELS[order.status]}
        </span>
        <span className="kds-amount">{formatGuaranies(grandTotal)}</span>
      </div>

      {/* Body — items */}
      {order.order_items.length > 0 && (
        <p className="kds-items" data-testid="order-card-items">
          {itemsSummary}
        </p>
      )}

      {/* Footer */}
      <div className="kds-footer">
        <div className="kds-meta">
          <span className="kds-customer">{order.customer_name}</span>
          <span
            className="kds-timestamp"
            data-testid={`order-timestamp-${order.id}`}
          >
            {formatRelativeTime(order.created_at)}
          </span>
        </div>
        <button
          type="button"
          className="kds-notify"
          aria-label="Notificar cliente por WhatsApp"
          onClick={handleNotify}
        >
          <MessageCircle size={18} aria-hidden="true" />
        </button>
      </div>

      {/* Action button / delivery fee form */}
      {showFeeForm ? (
        <div className="kds-fee-form" onClick={(e) => e.stopPropagation()}>
          <label className="kds-fee-label" htmlFor={`kds-fee-${order.id}`}>
            Costo de delivery (Gs.)
          </label>
          <GuaraniesInput
            id={`kds-fee-${order.id}`}
            className="kds-fee-input"
            placeholder="Ej: 15000"
            value={feeDigits}
            onChange={setFeeDigits}
            autoFocus
            disabled={submitting}
          />
          <div className="kds-fee-actions">
            <button
              type="button"
              className="kds-action kds-action-pending"
              onClick={handleFeeConfirm}
              disabled={submitting}
            >
              Confirmar
            </button>
            <button
              type="button"
              className="kds-fee-cancel"
              onClick={handleFeeCancel}
              disabled={submitting}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : actionLabel && nextStatus ? (
        <button
          type="button"
          className={`kds-action kds-action-${order.status}`}
          onClick={handleAdvance}
          disabled={submitting}
        >
          {submitting ? 'Procesando...' : actionLabel}
        </button>
      ) : null}

      <style>{`
        .kds-card {
          background: var(--refresh-surface-glass, var(--surface));
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-radius: var(--refresh-radius-card, 12px);
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          cursor: pointer;
          border: var(--refresh-border-hard, 1px solid var(--border));
          box-shadow: var(--refresh-shadow-hard-sm, none);
          transition: background 0.1s;
          list-style: none;
          font-family: var(--refresh-font-sans, inherit);
        }
        .kds-card:active { background: var(--surface-elevated); }
        [data-urgent="true"] { border-left: 3px solid #ef4444; }

        /* Header */
        .kds-header {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .kds-code {
          font-size: 18px;
          font-weight: 800;
          font-family: monospace;
          letter-spacing: 0.04em;
          color: var(--refresh-ink, var(--text-primary));
          flex: 1;
        }
        .kds-amount {
          font-size: 16px;
          font-weight: 700;
          font-family: var(--refresh-font-display, inherit);
          color: var(--refresh-ink, var(--text-primary));
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
        }

        /* Badge */
        .kds-badge {
          font-size: 11px;
          font-weight: 700;
          padding: 3px 8px;
          border-radius: 20px;
          white-space: nowrap;
          flex-shrink: 0;
        }
        /* Colors tuned to the design canvas's exact pending/confirmed/completed
           hues (Pedidos.dc.html status meta) — same values used by
           OrderDetailSheet.tsx's status pill. Cancelled has no canvas
           reference, kept as the existing neutral gray. */
        .badge-pending  { background: rgba(232,93,44,.16); color: #B5431C; border: 1px solid #B5431C; }
        .badge-confirmed { background: rgba(58,110,165,.14); color: #2E5F8A; border: 1px solid #2E5F8A; }
        .badge-completed { background: rgba(74,124,89,.14); color: #3F6B4C; border: 1px solid #3F6B4C; }
        .badge-cancelled { background: rgba(107,114,128,.1); color: #6b7280; border: 1px solid rgba(107,114,128,.2); }

        [data-theme='dark'] .badge-pending  { background: rgba(251,191,36,.15); color: #fbbf24; border-color: rgba(251,191,36,.3); }
        [data-theme='dark'] .badge-confirmed { background: rgba(96,165,250,.12); color: #60a5fa; border-color: rgba(96,165,250,.25); }
        [data-theme='dark'] .badge-completed { background: rgba(74,222,128,.12); color: #4ade80; border-color: rgba(74,222,128,.25); }
        [data-theme='dark'] .badge-cancelled { background: rgba(156,163,175,.1); color: #9ca3af; border-color: rgba(156,163,175,.2); }

        /* Items summary */
        .kds-items {
          font-size: 13px;
          color: var(--refresh-ink-secondary, var(--text-secondary));
          margin: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          line-height: 1.4;
        }

        /* Footer */
        .kds-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .kds-meta {
          display: flex;
          flex-direction: column;
          gap: 1px;
        }
        .kds-customer {
          font-size: 13px;
          font-weight: 600;
          color: var(--refresh-ink, var(--text-primary));
        }
        .kds-timestamp {
          font-size: 11px;
          color: var(--refresh-ink-muted, var(--text-muted));
        }
        .kds-notify {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 44px;
          min-height: unset;
          min-width: unset;
          padding: 0;
          border: 1px solid var(--border);
          border-radius: var(--refresh-radius-control, 8px);
          background: var(--surface-elevated);
          color: var(--refresh-ink-secondary, var(--text-secondary));
          cursor: pointer;
          flex-shrink: 0;
        }
        .kds-notify:active { color: var(--refresh-ink, var(--text-primary)); }

        /* Action button */
        .kds-action {
          width: 100%;
          min-height: 44px;
          border-radius: var(--refresh-radius-control, 10px);
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          border: none;
          letter-spacing: 0.01em;
          transition: opacity 0.1s;
        }
        .kds-action:active { opacity: 0.85; }
        .kds-action:disabled { opacity: 0.5; cursor: not-allowed; }
        .kds-action-pending {
          background: #f59e0b;
          color: #1c1003;
        }
        .kds-action-confirmed {
          background: #22c55e;
          color: #052e16;
        }

        /* Delivery fee form */
        .kds-fee-form {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .kds-fee-label {
          font-size: 12px;
          font-weight: 600;
          color: var(--refresh-ink-secondary, var(--text-secondary));
        }
        .kds-fee-input {
          padding: 12px 14px;
          font-size: 16px;
          font-weight: 600;
          border: 1px solid var(--border);
          border-radius: var(--refresh-radius-control, 10px);
          background: var(--surface-elevated);
          color: var(--refresh-ink, var(--text-primary));
          font-variant-numeric: tabular-nums;
          width: 100%;
          box-sizing: border-box;
        }
        .kds-fee-actions {
          display: flex;
          gap: 8px;
        }
        .kds-fee-actions .kds-action { flex: 1; }
        .kds-fee-cancel {
          flex: 1;
          min-height: 44px;
          border-radius: var(--refresh-radius-control, 10px);
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          border: 1px solid var(--border);
          background: var(--surface-elevated);
          color: var(--refresh-ink-secondary, var(--text-secondary));
        }
        .kds-fee-cancel:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>
    </li>
  );
}
