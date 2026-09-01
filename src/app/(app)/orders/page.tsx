'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { MessageCircle, ChevronDown } from 'lucide-react';
import { formatGuaranies } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { useBranch } from '@/contexts/BranchContext';
import { useSettings } from '@/contexts/SettingsContext';
import { ErrorState } from '@/components/ErrorState';
import { EmptyState } from '@/components/EmptyState';
import { buildStatusNotificationMessage, buildWhatsAppLink } from '@/lib/storefront';
import { ORDER_STATUS_LABELS, type Order, type OrderStatus } from '@/types';

const STATUS_TABS: Array<{ value: OrderStatus | 'all'; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'confirmed', label: 'Confirmados' },
  { value: 'completed', label: 'Completados' },
  { value: 'cancelled', label: 'Cancelados' },
];

const STATUS_OPTIONS: OrderStatus[] = ['pending', 'confirmed', 'completed', 'cancelled'];

const POLL_INTERVAL_MS = 30_000;

export default function OrdersPage() {
  const { currentBranch, initialized } = useBranch();
  const { settings } = useSettings();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [reloadToken, setReloadToken] = useState(0);

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
      .select('*')
      .eq('branch_id', branch.id)
      .order('created_at', { ascending: false });

    if (fetchError) { setError(true); }
    else if (data) { setOrders(data as Order[]); }
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

  const handleNotify = (order: Order) => {
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
              <li key={order.id} className="order-item">
                <Link href={`/orders/${order.id}`} className="order-info">
                  <div className="order-row-top">
                    <span className="order-code">{order.order_code}</span>
                    <span className="order-amount">{formatGuaranies(order.total)}</span>
                  </div>
                  <span className="order-customer">{order.customer_name}</span>
                </Link>
                <div className="order-actions" onClick={(e) => e.stopPropagation()}>
                  <div className="status-pill-wrap">
                    <select
                      className={`status-pill status-${order.status}`}
                      value={order.status}
                      onChange={(e) => handleStatusChange(order.id, e.target.value as OrderStatus)}
                      aria-label="Estado del pedido"
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>
                      ))}
                    </select>
                    <ChevronDown size={10} className="status-chevron" aria-hidden="true" />
                  </div>
                  <button
                    type="button"
                    className="notify-btn"
                    aria-label="Notificar cliente"
                    title="Notificar cliente"
                    onClick={() => handleNotify(order)}
                  >
                    <MessageCircle size={15} />
                  </button>
                </div>
              </li>
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
          list-style: none; display: flex; flex-direction: column;
          gap: 1px; background: var(--border); border-radius: 12px; overflow: hidden;
        }
        .order-item {
          display: flex; align-items: center; gap: 12px;
          padding: 14px 16px; background: var(--surface);
        }
        .order-info {
          flex: 1; min-width: 0; text-decoration: none; color: inherit;
          display: flex; flex-direction: column; gap: 3px;
        }
        .order-row-top {
          display: flex; justify-content: space-between; align-items: baseline; gap: 8px;
        }
        .order-code { font-size: 14px; font-weight: 700; color: var(--text-primary); }
        .order-amount {
          font-size: 14px; font-weight: 600; color: var(--text-primary);
          font-variant-numeric: tabular-nums; white-space: nowrap;
        }
        .order-customer { font-size: 12px; color: var(--text-secondary); }

        .order-actions {
          flex-shrink: 0; display: flex; flex-direction: column; align-items: flex-end; gap: 6px;
        }

        /* Status pill — styled select */
        .status-pill-wrap { position: relative; display: flex; align-items: center; }
        .status-pill {
          appearance: none; -webkit-appearance: none;
          min-height: unset; min-width: unset;
          padding: 4px 22px 4px 9px;
          border-radius: 20px; font-size: 11px; font-weight: 600;
          cursor: pointer; border: 1px solid transparent; width: auto;
        }
        .status-chevron {
          position: absolute; right: 7px; pointer-events: none; opacity: 0.6;
        }

        .status-pill.status-pending  { background: rgba(217,119,6,.14); color: #92400e; border-color: rgba(217,119,6,.28); }
        .status-pill.status-confirmed { background: rgba(37,99,235,.12); color: #1e40af; border-color: rgba(37,99,235,.24); }
        .status-pill.status-completed { background: rgba(22,163,74,.12); color: #166534; border-color: rgba(22,163,74,.24); }
        .status-pill.status-cancelled { background: rgba(107,114,128,.1); color: #6b7280; border-color: rgba(107,114,128,.2); }

        [data-theme='dark'] .status-pill.status-pending  { background: rgba(251,191,36,.15); color: #fbbf24; border-color: rgba(251,191,36,.3); }
        [data-theme='dark'] .status-pill.status-confirmed { background: rgba(96,165,250,.12); color: #60a5fa; border-color: rgba(96,165,250,.25); }
        [data-theme='dark'] .status-pill.status-completed { background: rgba(74,222,128,.12); color: #4ade80; border-color: rgba(74,222,128,.25); }
        [data-theme='dark'] .status-pill.status-cancelled { background: rgba(156,163,175,.1); color: #9ca3af; border-color: rgba(156,163,175,.2); }

        .notify-btn {
          display: flex; align-items: center; justify-content: center;
          width: 28px; height: 28px; min-height: unset; min-width: unset;
          padding: 0; border: none; border-radius: 7px;
          background: var(--surface-elevated); color: var(--text-secondary); cursor: pointer;
          transition: color 0.15s;
        }
        .notify-btn:hover { color: var(--text-primary); }
      `}</style>
    </div>
  );
}
