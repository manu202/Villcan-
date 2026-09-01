'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { formatGuaranies } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { useBranch } from '@/contexts/BranchContext';
import { ErrorState } from '@/components/ErrorState';
import { EmptyState } from '@/components/EmptyState';
import type { Order, OrderStatus } from '@/types';

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
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [reloadToken, setReloadToken] = useState(0);

  const currentBranchRef = useRef(currentBranch);
  useEffect(() => {
    currentBranchRef.current = currentBranch;
  }, [currentBranch]);

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

    if (fetchError) {
      setError(true);
    } else if (data) {
      setOrders(data as Order[]);
    }
    if (!silent) setLoading(false);
  }, []);

  useEffect(() => {
    if (!initialized || !currentBranch) return;
    loadOrders();
  }, [initialized, currentBranch, loadOrders, reloadToken]);

  // 30s polling for incoming orders (Realtime is out of scope — design "Rutas y componentes").
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

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-title">Pedidos</h1>
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
                <div className="order-info">
                  <span className="order-code">{order.order_code}</span>
                  <span className="order-customer">{order.customer_name}</span>
                  <span className="order-total">{formatGuaranies(order.total)}</span>
                </div>
                <select
                  value={order.status}
                  onChange={(e) => handleStatusChange(order.id, e.target.value as OrderStatus)}
                >
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        )}
      </section>

      <style>{`
        .page {
          max-width: 480px;
          margin: 0 auto;
        }
        .status-tabs {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding: 12px 0;
        }
        .status-tab {
          padding: 8px 14px;
          border-radius: 20px;
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--text-secondary);
          font-size: 13px;
          font-weight: 600;
          white-space: nowrap;
          cursor: pointer;
        }
        .status-tab.active {
          background: var(--accent);
          color: var(--accent-foreground);
          border-color: var(--accent);
        }
        .order-list {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 1px;
          background: var(--border);
          border-radius: 12px;
          overflow: hidden;
        }
        .order-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          padding: 16px 20px;
          background: var(--surface);
        }
        .order-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .order-code {
          font-size: 15px;
          font-weight: 700;
          color: var(--text-primary);
        }
        .order-customer {
          font-size: 13px;
          color: var(--text-secondary);
        }
        .order-total {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
        }
      `}</style>
    </div>
  );
}
