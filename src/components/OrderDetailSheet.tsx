'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getOrderWithItems, updateOrderStatus } from '@/lib/data/orders';
import { formatGuaranies, formatRelativeTime } from '@/lib/utils';
import { buildStatusNotificationMessage, buildWhatsAppLink } from '@/lib/storefront';
import { useSettings } from '@/contexts/SettingsContext';
import { useToast } from '@/contexts/ToastContext';
import { ORDER_STATUS_LABELS, type OrderStatus, type OrderWithItems } from '@/types';
import { Spinner } from '@/components/Spinner';
import { OrderPaymentSheet } from '@/components/OrderPaymentSheet';
import { MessageCircle, ExternalLink } from 'lucide-react';

const STATUS_OPTIONS: OrderStatus[] = ['pending', 'confirmed', 'completed', 'cancelled'];

interface OrderDetailSheetProps {
  orderId: string;
  onClose: () => void;
}

export function OrderDetailSheet({ orderId, onClose }: OrderDetailSheetProps) {
  const { settings } = useSettings();
  const { showToast } = useToast();
  const [order, setOrder] = useState<OrderWithItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusSubmitting, setStatusSubmitting] = useState(false);
  const [paymentSheetOpen, setPaymentSheetOpen] = useState(false);

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    setLoading(true);

    const load = async () => {
      const { data } = await getOrderWithItems(orderId);

      if (!cancelled) {
        setOrder(data as OrderWithItems);
        setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [orderId]);

  const handleStatusChange = async (status: OrderStatus) => {
    if (!order) return;

    // SW-O1: completing an order must go through the atomic
    // complete_order_payment RPC (via OrderPaymentSheet), never a raw
    // status update — that path can bypass the RPC and undercount the
    // delivery fee through a legacy trigger.
    if (status === 'completed') {
      setPaymentSheetOpen(true);
      return;
    }

    // SW-O7: cancelling is effectively irreversible (a DB-level freeze
    // trigger blocks any further status change once an order is
    // completed/cancelled), so require confirmation first.
    if (status === 'cancelled') {
      const confirmed = window.confirm('¿Cancelar este pedido? Esta acción no se puede deshacer.');
      if (!confirmed) return;
    }

    setStatusSubmitting(true);
    // .select('id').single() detects 0-row RLS/trigger blocks as an error
    // (SW-O6): a plain .update().eq() returns error:null even when no rows
    // are affected.
    const { data, error } = await updateOrderStatus(orderId, { status });
    setStatusSubmitting(false);

    if (error || !data) {
      showToast('Error al cambiar el estado del pedido', 'error');
      return;
    }
    setOrder((prev) => prev ? { ...prev, status } : prev);
  };

  const handlePaymentCompleted = async () => {
    setPaymentSheetOpen(false);
    if (!orderId) return;
    const { data } = await getOrderWithItems(orderId);
    // complete_order_payment already succeeded server-side by the time this
    // runs (OrderPaymentSheet only calls onCompleted on success) — a failure
    // here is just this refetch, not the payment, but the sheet must not
    // silently keep showing the stale pre-completion status.
    if (data) {
      setOrder(data as OrderWithItems);
    } else {
      // Covers both an explicit error AND the case where .single() resolves
      // with neither data nor error (e.g. zero matching rows with no
      // driver-level error) — either way, the sheet must not silently keep
      // showing the stale pre-completion status.
      showToast('El pago se registró, pero no se pudo actualizar la vista. Recargá la página.', 'error');
    }
  };

  const handleNotify = () => {
    if (!order) return;
    const message = buildStatusNotificationMessage(order, settings.business_name);
    const link = buildWhatsAppLink(order.customer_phone, message);
    window.open(link, '_blank');
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '32px' }}>
        <Spinner size={36} color="black" />
      </div>
    );
  }

  if (!order) {
    return <p style={{ padding: '16px', color: 'var(--text-secondary)' }}>Pedido no encontrado.</p>;
  }

  return (
    <div className="ods">
      <div className="ods-meta">
        <span className="ods-code">#{order.order_code}</span>
        <span className="ods-time">{formatRelativeTime(order.created_at)}</span>
      </div>

      <div className="ods-customer">
        <p className="ods-name">{order.customer_name}</p>
        {order.customer_phone && <p className="ods-phone">{order.customer_phone}</p>}
      </div>

      {order.order_items.length > 0 && (
        <ul className="ods-items">
          {order.order_items.map((item) => (
            <li key={item.id} className="ods-item">
              <span className="ods-item-name">{item.qty}× {item.name_snapshot}</span>
              <span className="ods-item-price">{formatGuaranies(item.line_total)}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="ods-total">
        <span>Total</span>
        <strong>
          {formatGuaranies(
            order.total + (order.delivery_type === 'delivery' ? (order.delivery_fee ?? 0) : 0)
          )}
        </strong>
      </div>

      {order.note && <p className="ods-note">{order.note}</p>}

      {/*
        Canvas (Pedidos.dc.html) shows a read-only status pill + fixed
        Aceptar/Rechazar/Marcar-completado CTA buttons per status. The real
        app's <select> is strictly more flexible: staff can jump straight to
        ANY status (pending/confirmed/completed/cancelled), which is real
        functionality relied on in practice — forcing the canvas's fixed
        2-button flow would remove that. Resolution: keep the <select> fully
        functional (same STATUS_OPTIONS, same handleStatusChange), but skin
        it as a pill matching the canvas's status badge colors instead of a
        plain bordered dropdown, and pair it with a "Notificar cliente"
        primary CTA styled like the canvas's hard-shadow primary button.
      */}
      <div className="ods-actions">
        <select
          className={`ods-status-select status-${order.status}`}
          value={order.status}
          onChange={(e) => handleStatusChange(e.target.value as OrderStatus)}
          aria-label="Estado del pedido"
          disabled={statusSubmitting}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>
          ))}
        </select>

        <button type="button" className="ods-btn-notify" onClick={handleNotify} aria-label="Notificar cliente">
          <MessageCircle size={16} aria-hidden="true" />
          WhatsApp
        </button>
      </div>

      <Link href={`/orders/${order.id}`} className="ods-link-full" onClick={onClose}>
        <ExternalLink size={14} aria-hidden="true" />
        Ver / Editar pedido completo
      </Link>

      <OrderPaymentSheet
        order={order}
        items={order.order_items}
        open={paymentSheetOpen}
        onOpenChange={setPaymentSheetOpen}
        onCompleted={handlePaymentCompleted}
      />

      <style>{`
        .ods { display: flex; flex-direction: column; gap: 16px; font-family: var(--refresh-font-sans, inherit); }
        .ods-meta { display: flex; justify-content: space-between; align-items: center; }
        .ods-code { font-size: 18px; font-weight: 700; font-family: monospace; letter-spacing: 0.05em; color: var(--refresh-ink, var(--text-primary)); }
        .ods-time { font-size: 12px; color: var(--refresh-ink-muted, var(--text-secondary)); }
        .ods-customer { display: flex; flex-direction: column; gap: 2px; }
        .ods-name { font-size: 16px; font-weight: 600; color: var(--refresh-ink, var(--text-primary)); margin: 0; }
        .ods-phone { font-size: 13px; color: var(--refresh-ink-secondary, var(--text-secondary)); margin: 0; }
        .ods-items {
          list-style: none;
          border: var(--refresh-border-hard, 1px solid var(--border));
          border-radius: var(--refresh-radius-card, 14px);
          background: var(--refresh-surface-glass, var(--surface));
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          overflow: hidden;
        }
        .ods-item { display: flex; justify-content: space-between; padding: 12px 14px; font-size: 14px; }
        .ods-item + .ods-item { border-top: 1.5px solid rgba(36, 27, 22, 0.15); }
        .ods-item-name { color: var(--refresh-ink, var(--text-primary)); font-weight: 600; }
        .ods-item-price { color: var(--refresh-ink, var(--text-primary)); font-weight: 700; font-variant-numeric: tabular-nums; }
        .ods-total { display: flex; justify-content: space-between; align-items: baseline; padding-top: 12px; border-top: 2px solid rgba(36, 27, 22, 0.15); }
        .ods-total span { font-size: 15px; font-weight: 700; color: var(--refresh-ink, var(--text-primary)); }
        .ods-total strong { font-family: var(--refresh-font-display, inherit); font-size: 22px; font-weight: 400; color: var(--refresh-accent, var(--accent)); }
        .ods-note { font-size: 13px; color: var(--refresh-ink-secondary, var(--text-secondary)); background: var(--accent-subtle); padding: 10px 12px; border-radius: 8px; margin: 0; }
        .ods-actions { display: flex; gap: 10px; }
        /* Functional status control (real STATUS_OPTIONS dropdown), skinned
           as a pill matching the canvas's badge colors — see comment above
           the JSX for why this stays a <select>, not the canvas's fixed
           buttons. */
        .ods-status-select {
          flex: 1;
          min-height: 44px;
          padding: 10px 14px;
          border-radius: 999px;
          border: 1.5px solid;
          font-size: 13px;
          font-weight: 700;
          text-align: center;
          text-align-last: center;
          cursor: pointer;
        }
        .ods-status-select:disabled { opacity: 0.6; cursor: not-allowed; }
        /* SW-O9: same status→color tokens as orders/[id]/page.tsx's status
           pill, tuned to the canvas's exact pending/confirmed/completed hues. */
        .ods-status-select.status-pending  { background: rgba(232,93,44,.16); color: #B5431C; border-color: #B5431C; }
        .ods-status-select.status-confirmed { background: rgba(58,110,165,.14); color: #2E5F8A; border-color: #2E5F8A; }
        .ods-status-select.status-completed { background: rgba(74,124,89,.14); color: #3F6B4C; border-color: #3F6B4C; }
        .ods-status-select.status-cancelled { background: rgba(107,114,128,.1); color: #6b7280; border-color: rgba(107,114,128,.28); }
        [data-theme='dark'] .ods-status-select.status-pending  { background: rgba(251,191,36,.15); color: #fbbf24; border-color: rgba(251,191,36,.3); }
        [data-theme='dark'] .ods-status-select.status-confirmed { background: rgba(96,165,250,.12); color: #60a5fa; border-color: rgba(96,165,250,.25); }
        [data-theme='dark'] .ods-status-select.status-completed { background: rgba(74,222,128,.12); color: #4ade80; border-color: rgba(74,222,128,.25); }
        [data-theme='dark'] .ods-status-select.status-cancelled { background: rgba(156,163,175,.1); color: #9ca3af; border-color: rgba(156,163,175,.2); }
        /* WhatsApp brand green is intentionally kept (semantic, not the
           accent token — same call as T3's OrderCard notify button), just
           given the canvas's hard-offset primary-CTA treatment. */
        .ods-btn-notify {
          flex: 2;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          min-height: 44px;
          padding: 10px 14px;
          background: #25D366;
          color: #FFF8F3;
          border-radius: var(--refresh-radius-control, 12px);
          border: 2px solid rgba(36, 27, 22, 0.85);
          box-shadow: var(--refresh-shadow-hard-sm, 4px 4px 0 rgba(36, 27, 22, 0.85));
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
        }
        .ods-btn-notify:active { box-shadow: none; transform: translate(4px, 4px); }
        .ods-link-full {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          color: var(--refresh-ink-secondary, var(--text-secondary));
          text-decoration: none;
          border: 1px solid var(--border);
          border-radius: var(--refresh-radius-control, 8px);
          padding: 10px 12px;
          min-height: 44px;
          justify-content: center;
        }
        .ods-link-full:active { background: var(--accent-subtle); }
      `}</style>
    </div>
  );
}
