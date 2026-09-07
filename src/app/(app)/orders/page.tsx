'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { formatGuaranies } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { useBranch } from '@/contexts/BranchContext';
import { useSettings } from '@/contexts/SettingsContext';
import { ErrorState } from '@/components/ErrorState';
import { EmptyState } from '@/components/EmptyState';
import { buildStatusNotificationMessage, buildWhatsAppLink } from '@/lib/storefront';
import { type OrderStatus, type OrderWithItems } from '@/types';
import { AppSheet } from '@/components/AppSheet';
import { OrderDetailSheet } from '@/components/OrderDetailSheet';
import { OrderCard } from '@/components/OrderCard';

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
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [reloadToken, setReloadToken] = useState(0);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const currentBranchRef = useRef(currentBranch);
  useEffect(() => { currentBranchRef.current = currentBranch; }, [currentBranch]);

  const loadOrders = useCallback(async (silent = false) => {
    const branch = currentBranchRef.current;
    if (!branch) return;
    if (!silent) setLoading(true);
    setError(false);
    const supabase = createClient();
    const { data, error: fetchError } = await supabase
      .from('orders')
      .select('*, order_items(id,qty,name_snapshot)')
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

  const handleStatusChange = async (orderId: string, status: OrderStatus) => {
    const supabase = createClient();
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status } : o)));
    await supabase.from('orders').update({ status }).eq('id', orderId);
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
    </div>
  );
}
