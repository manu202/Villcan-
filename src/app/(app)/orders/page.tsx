'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
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

const STATUS_TABS: Array<{ value: OrderStatus | 'all'; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'confirmed', label: 'Confirmados' },
  { value: 'completed', label: 'Completados' },
  { value: 'cancelled', label: 'Cancelados' },
];

const POLL_INTERVAL_MS = 30_000;

export default function OrdersPage() {
  const { currentBranch, initialized } = useBranch();
  const { settings } = useSettings();
  const { showToast } = useToast();
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
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
    const supabase = createClient();
    // Full order_items columns (not just id/qty/name_snapshot) so the same
    // in-memory order object can be handed straight to OrderPaymentSheet
    // (SW-O1) without a second fetch.
    const { data, error: fetchError } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('branch_id', branch.id)
      .order('created_at', { ascending: false });

    if (fetchError) { setError(true); }
    else if (data) { setOrders(data as OrderWithItems[]); }
    if (!silent) setLoading(false);
  }, []);

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
    const supabase = createClient();
    const update: Record<string, unknown> = { status };
    if (deliveryFee !== undefined) update.delivery_fee = deliveryFee;
    // SW-O6: check the write result before mutating local state — a plain
    // .update().eq() returns error:null even when RLS/a trigger blocks the
    // write (0 rows affected), so .select('id').single() is needed to
    // detect that case.
    const { data, error } = await supabase
      .from('orders')
      .update(update)
      .eq('id', orderId)
      .select('id')
      .single();
    setSubmittingOrderId(null);

    if (error || !data) {
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
        .page { max-width: 480px; margin: 0 auto; }

        .flex-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .new-order-btn {
          padding: 9px 16px;
          background: var(--accent); color: var(--accent-foreground);
          border-radius: 8px; font-size: 14px; font-weight: 600; text-decoration: none;
          white-space: nowrap; flex-shrink: 0; min-height: unset;
        }

        .status-tabs {
          display: flex; gap: 8px; overflow-x: auto; padding: 12px 0;
          scrollbar-width: none;
        }
        .status-tabs::-webkit-scrollbar { display: none; }
        .status-tab {
          padding: 7px 14px; border-radius: 20px; border: 1px solid var(--border);
          background: var(--surface); color: var(--text-secondary);
          font-size: 13px; font-weight: 600; white-space: nowrap; cursor: pointer;
          min-height: unset; min-width: unset; flex-shrink: 0;
        }
        .status-tab.active {
          background: var(--accent); color: var(--accent-foreground); border-color: var(--accent);
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
