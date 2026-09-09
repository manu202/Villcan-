'use client';

import { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { formatGuaranies, formatRelativeTime, isOlderThan } from '@/lib/utils';
import { buildStatusNotificationMessage, buildWhatsAppLink } from '@/lib/storefront';
import { ORDER_STATUS_LABELS, type OrderStatus, type OrderWithItems } from '@/types';

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
}

export function OrderCard({ order, onStatusChange, onNotify, onClick }: OrderCardProps) {
  const nextStatus = NEXT_STATUS[order.status];
  const actionLabel = ACTION_LABEL[order.status];
  const isUrgent = isOlderThan(order.created_at, 10) && order.status === 'pending';
  const itemsSummary = order.order_items
    .map((i) => `${i.qty}× ${i.name_snapshot}`)
    .join(', ');

  const [showFeeForm, setShowFeeForm] = useState(false);
  const [feeInput, setFeeInput] = useState('');

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
    onStatusChange(order.id, 'confirmed', parseInt(feeInput, 10) || 0);
    setShowFeeForm(false);
    setFeeInput('');
  };

  const handleFeeCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowFeeForm(false);
    setFeeInput('');
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
        <span className="kds-amount">{formatGuaranies(order.total)}</span>
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
          <MessageCircle size={16} aria-hidden="true" />
        </button>
      </div>

      {/* Action button / delivery fee form */}
      {showFeeForm ? (
        <div className="kds-fee-form" onClick={(e) => e.stopPropagation()}>
          <label className="kds-fee-label" htmlFor={`kds-fee-${order.id}`}>
            Costo de delivery (Gs.)
          </label>
          <input
            id={`kds-fee-${order.id}`}
            type="number"
            className="kds-fee-input"
            placeholder="Ej: 15000"
            value={feeInput}
            onChange={(e) => setFeeInput(e.target.value)}
            inputMode="numeric"
            min={0}
            autoFocus
          />
          <div className="kds-fee-actions">
            <button type="button" className="kds-action kds-action-pending" onClick={handleFeeConfirm}>
              Confirmar
            </button>
            <button type="button" className="kds-fee-cancel" onClick={handleFeeCancel}>
              Cancelar
            </button>
          </div>
        </div>
      ) : actionLabel && nextStatus ? (
        <button
          type="button"
          className={`kds-action kds-action-${order.status}`}
          onClick={handleAdvance}
        >
          {actionLabel}
        </button>
      ) : null}

      <style>{`
        .kds-card {
          background: var(--surface);
          border-radius: 12px;
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          cursor: pointer;
          border: 1px solid var(--border);
          transition: background 0.1s;
          list-style: none;
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
          color: var(--text-primary);
          flex: 1;
        }
        .kds-amount {
          font-size: 16px;
          font-weight: 700;
          color: var(--text-primary);
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
        .badge-pending  { background: rgba(217,119,6,.14); color: #92400e; border: 1px solid rgba(217,119,6,.28); }
        .badge-confirmed { background: rgba(37,99,235,.12); color: #1e40af; border: 1px solid rgba(37,99,235,.24); }
        .badge-completed { background: rgba(22,163,74,.12); color: #166534; border: 1px solid rgba(22,163,74,.24); }
        .badge-cancelled { background: rgba(107,114,128,.1); color: #6b7280; border: 1px solid rgba(107,114,128,.2); }

        [data-theme='dark'] .badge-pending  { background: rgba(251,191,36,.15); color: #fbbf24; border-color: rgba(251,191,36,.3); }
        [data-theme='dark'] .badge-confirmed { background: rgba(96,165,250,.12); color: #60a5fa; border-color: rgba(96,165,250,.25); }
        [data-theme='dark'] .badge-completed { background: rgba(74,222,128,.12); color: #4ade80; border-color: rgba(74,222,128,.25); }
        [data-theme='dark'] .badge-cancelled { background: rgba(156,163,175,.1); color: #9ca3af; border-color: rgba(156,163,175,.2); }

        /* Items summary */
        .kds-items {
          font-size: 13px;
          color: var(--text-secondary);
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
          color: var(--text-primary);
        }
        .kds-timestamp {
          font-size: 11px;
          color: var(--text-muted);
        }
        .kds-notify {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          min-height: unset;
          min-width: unset;
          padding: 0;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--surface-elevated);
          color: var(--text-secondary);
          cursor: pointer;
          flex-shrink: 0;
        }
        .kds-notify:active { color: var(--text-primary); }

        /* Action button */
        .kds-action {
          width: 100%;
          min-height: 44px;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          border: none;
          letter-spacing: 0.01em;
          transition: opacity 0.1s;
        }
        .kds-action:active { opacity: 0.85; }
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
          color: var(--text-secondary);
        }
        .kds-fee-input {
          padding: 12px 14px;
          font-size: 16px;
          font-weight: 600;
          border: 1px solid var(--border);
          border-radius: 10px;
          background: var(--surface-elevated);
          color: var(--text-primary);
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
          border-radius: 10px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          border: 1px solid var(--border);
          background: var(--surface-elevated);
          color: var(--text-secondary);
        }
      `}</style>
    </li>
  );
}
