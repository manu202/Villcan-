'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { confirmOrderDeliveryFee, listOrdersForBranch, updateOrderStatus } from '@/lib/data/orders';
import { useBranch } from '@/contexts/BranchContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useToast } from '@/contexts/ToastContext';
import { ErrorState } from '@/components/ErrorState';
import { EmptyState } from '@/components/EmptyState';
import { buildStatusNotificationMessage, buildWhatsAppLink } from '@/lib/storefront';
import { type OrderStatus, type OrderWithItems } from '@/types';
import { AppSheet } from '@/components/AppSheet';
import { OrderDetailSheet } from '@/components/OrderDetailSheet';
import { OrderCard } from '@/components/OrderCard';
import { OrderPaymentSheet } from '@/components/OrderPaymentSheet';
import { getDateRange } from '@/lib/dateRange';

const STATUS_TABS: Array<{ value: OrderStatus | 'all'; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'confirmed', label: 'Confirmados' },
  { value: 'completed', label: 'Completados' },
  { value: 'cancelled', label: 'Cancelados' },
];

// M-8: drill-down from Reports' "Servicios" breakdown links here with
// ?range=<today|week|month>, seeding this date filter instead of inventing
// a new one -- same vocabulary/values as Movements' own filter, minus
// 'custom' (Reports only offers a drill-down link for its named views, see
// reports/page.tsx). Not present in the URL (direct navigation, the normal
// case) -> 'all', matching this page's original always-unscoped-by-date
// behavior exactly.
type DateFilter = 'today' | 'week' | 'month' | 'all';
const DATE_FILTER_VALUES: DateFilter[] = ['today', 'week', 'month', 'all'];

function readDateFilterFromParams(params: URLSearchParams): DateFilter {
  const range = params.get('range');
  return (DATE_FILTER_VALUES as string[]).includes(range ?? '') ? (range as DateFilter) : 'all';
}

const DATE_FILTER_TABS: Array<{ value: DateFilter; label: string }> = [
  { value: 'today', label: 'Hoy' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mes' },
  { value: 'all', label: 'Todo' },
];

const POLL_INTERVAL_MS = 30_000;

export default function OrdersPage() {
  const { currentBranch, initialized } = useBranch();
  const { settings } = useSettings();
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>(() => readDateFilterFromParams(searchParams));
  const [reloadToken, setReloadToken] = useState(0);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [submittingOrderId, setSubmittingOrderId] = useState<string | null>(null);
  const [paymentOrder, setPaymentOrder] = useState<OrderWithItems | null>(null);
  const [paymentSheetOpen, setPaymentSheetOpen] = useState(false);

  const currentBranchRef = useRef(currentBranch);
  useEffect(() => { currentBranchRef.current = currentBranch; }, [currentBranch]);

  const loadOrders = useCallback(async (silent = false) => {
    const branch = currentBranchRef.current;
    if (!branch) return;
    if (!silent) setLoading(true);
    setError(false);
    const { start, end } = dateFilter === 'all' ? {} : getDateRange(dateFilter);
    const { data, error: fetchError } = await listOrdersForBranch(branch.id, start, end);

    if (fetchError) { setError(true); }
    else if (data) { setOrders(data as OrderWithItems[]); }
    if (!silent) setLoading(false);
  }, [dateFilter]);

  useEffect(() => {
    if (!initialized || !currentBranch) return;
    loadOrders();
  }, [initialized, currentBranch, loadOrders, reloadToken]);

  useEffect(() => {
    if (!initialized || !currentBranch) return;
    const interval = setInterval(() => loadOrders(true), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [initialized, currentBranch, loadOrders]);

  const handleStatusChange = async (orderId: string, status: OrderStatus, deliveryFee?: number) => {
    // SW-O1: completing an order must go through the atomic
    // complete_order_payment RPC (via OrderPaymentSheet), never a raw
    // status update — that path can bypass the RPC and undercount the
    // delivery fee through a legacy trigger.
    if (status === 'completed') {
      const target = orders.find((o) => o.id === orderId);
      if (!target) return;
      setPaymentOrder(target);
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

    setSubmittingOrderId(orderId);

    // Confirming a delivery order with its fee goes through a dedicated RPC
    // (2026-09-22 fix): a direct .update({status, delivery_fee}) on the
    // orders table is blocked by the financial-fields guard trigger, which
    // has no bypass for this path (only update_order/create_manual_order
    // set delivery_fee legitimately outside it). Every other status change
    // (no fee involved) keeps using the plain updateOrderStatus write.
    let failed: boolean;
    if (deliveryFee !== undefined) {
      const { error } = await confirmOrderDeliveryFee(orderId, deliveryFee);
      failed = !!error;
    } else {
      // SW-O6: check the write result before mutating local state — a plain
      // .update().eq() returns error:null even when RLS/a trigger blocks
      // the write (0 rows affected), so .select('id').single() is needed
      // to detect that case.
      const { data, error } = await updateOrderStatus(orderId, { status });
      failed = !!error || !data;
    }
    setSubmittingOrderId(null);

    if (failed) {
      showToast('Error al cambiar el estado del pedido', 'error');
      return;
    }

    setOrders((prev) => prev.map((o) =>
      o.id === orderId
        ? { ...o, status, ...(deliveryFee !== undefined ? { delivery_fee: deliveryFee } : {}) }
        : o
    ));
  };

  const handlePaymentCompleted = () => {
    setPaymentSheetOpen(false);
    setPaymentOrder(null);
    setReloadToken((t) => t + 1);
  };

  const visibleOrders = orders.filter((o) => statusFilter === 'all' || o.status === statusFilter);

  const handleNotify = (order: OrderWithItems) => {
    const message = buildStatusNotificationMessage(order, settings.business_name);
    const link = buildWhatsAppLink(order.customer_phone, message);
    window.open(link, '_blank');
  };

  return (
    <div className="page">
      <header className="page-header flex-header">
        <h1 className="page-title">Pedidos</h1>
        <Link href="/orders/new" className="new-order-btn">Nuevo pedido</Link>
      </header>

      <div className="status-tabs">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            className={`status-tab ${statusFilter === tab.value ? 'active' : ''}`}
            onClick={() => setStatusFilter(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="date-filter-row">
        {DATE_FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            className={`date-filter-btn ${dateFilter === tab.value ? 'active' : ''}`}
            onClick={() => setDateFilter(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <section className="section">
        {loading ? (
          <p className="page-subtitle">Cargando...</p>
        ) : error ? (
          <ErrorState onRetry={() => setReloadToken((t) => t + 1)} />
        ) : visibleOrders.length === 0 ? (
          <EmptyState title="Sin pedidos" message="No hay pedidos para este filtro." />
        ) : (
          <ul className="order-list">
            {visibleOrders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                onStatusChange={handleStatusChange}
                onNotify={handleNotify}
                onClick={setSelectedOrderId}
                submitting={submittingOrderId === order.id}
              />
            ))}
          </ul>
        )}
      </section>

      <style>{`
        .page { max-width: 480px; margin: 0 auto; background: var(--refresh-bg, transparent); }

        .page-title {
          font-family: var(--refresh-font-display, inherit);
          color: var(--refresh-ink, var(--text-primary));
        }

        .flex-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .new-order-btn {
          padding: 9px 16px;
          min-height: 44px;
          display: inline-flex; align-items: center; justify-content: center;
          background: var(--refresh-accent, var(--accent)); color: #fff;
          border: var(--refresh-border-hard, none);
          box-shadow: var(--refresh-shadow-hard-sm, none);
          border-radius: var(--refresh-radius-control, 8px); font-size: 14px; font-weight: 600; text-decoration: none;
          white-space: nowrap; flex-shrink: 0;
          font-family: var(--refresh-font-sans, inherit);
        }

        .status-tabs {
          display: flex; gap: 8px; overflow-x: auto; padding: 12px 0;
          scrollbar-width: none;
        }
        .status-tabs::-webkit-scrollbar { display: none; }
        .status-tab {
          padding: 7px 14px; border-radius: var(--refresh-radius-control, 20px);
          border: var(--refresh-border-hard, 1px solid var(--border));
          background: var(--refresh-surface-glass, var(--surface)); color: var(--refresh-ink-secondary, var(--text-secondary));
          font-size: 13px; font-weight: 600; white-space: nowrap; cursor: pointer;
          min-height: 44px; flex-shrink: 0;
          display: inline-flex; align-items: center; justify-content: center;
          font-family: var(--refresh-font-sans, inherit);
        }
        .status-tab.active {
          background: var(--refresh-accent, var(--accent)); color: #fff; border-color: var(--refresh-accent, var(--accent));
        }

        /* M-8: date-scope tabs, separate row from status -- same visual
           language as Movements' own filter-row so the two feel like one
           system, not a bolted-on second control. */
        .date-filter-row {
          display: flex; gap: 8px; padding-bottom: 12px;
        }
        .date-filter-btn {
          flex: 1;
          padding: 10px 12px;
          min-height: 44px;
          display: flex; align-items: center; justify-content: center;
          background: var(--refresh-surface-glass, var(--surface));
          border: var(--refresh-border-hard, 1px solid var(--border));
          border-radius: var(--refresh-radius-control, 8px);
          font-size: 13px; font-weight: 600;
          color: var(--refresh-ink-secondary, var(--text-secondary));
          cursor: pointer;
          font-family: var(--refresh-font-sans, inherit);
        }
        .date-filter-btn.active {
          background: var(--refresh-accent, var(--accent)); color: #fff; border-color: var(--refresh-accent, var(--accent));
        }

        .order-list {
          list-style: none; display: flex; flex-direction: column; gap: 8px; padding: 0;
        }
      `}</style>

      <AppSheet
        open={selectedOrderId !== null}
        onOpenChange={(open) => { if (!open) setSelectedOrderId(null); }}
        title="Detalle del pedido"
      >
        {selectedOrderId && (
          <OrderDetailSheet orderId={selectedOrderId} onClose={() => setSelectedOrderId(null)} />
        )}
      </AppSheet>

      {paymentOrder && (
        <OrderPaymentSheet
          order={paymentOrder}
          items={paymentOrder.order_items}
          open={paymentSheetOpen}
          onOpenChange={setPaymentSheetOpen}
          onCompleted={handlePaymentCompleted}
        />
      )}
    </div>
  );
}
