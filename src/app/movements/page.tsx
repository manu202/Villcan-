'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { formatGuaranies, formatDate, formatTime, getMovementTypeLabel } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { useBranch } from '@/contexts/BranchContext';
import type { MovementWithDetails } from '@/types';
import { Spinner } from '@/components/Spinner';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';

type FilterType = 'today' | 'week' | 'month' | 'all';

const getDateRange = (filter: FilterType): { start: string; end: string } => {
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + 1); // tomorrow

  let start: Date;
  switch (filter) {
    case 'today':
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case 'week':
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
      break;
    case 'month':
      start = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      break;
    case 'all':
    default:
      return { start: '2000-01-01', end: '2100-01-01' };
  }
  return { start: start.toISOString(), end: end.toISOString() };
};

const TOTAL_MOVEMENTS = 100; // Maximum requested

export default function MovementsPage() {
  const { currentBranch, initialized } = useBranch();
  const [movements, setMovements] = useState<MovementWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<FilterType>('today');

  // Use ref to always have current branch value inside async functions
  const currentBranchRef = useRef(currentBranch);
  useEffect(() => {
    currentBranchRef.current = currentBranch;
  }, [currentBranch]);

  useEffect(() => {
    if (!initialized) return;

    let cancelled = false;

    const loadMovements = async () => {
      const branch = currentBranchRef.current;
      if (!branch) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(false);
      const supabase = createClient();
      const { start, end } = getDateRange(filter);

      let query = supabase
        .from('movements')
        .select(`
          id, type, amount_charged, income, expense, payment_method, comment, created_at,
          contact:contacts(id, full_name),
          service:services(id, name)
        `)
        .gte('created_at', start)
        .lt('created_at', end)
        .order('created_at', { ascending: false })
        .limit(100);

      query = query.eq('branch_id', branch.id);

      const { data, error: fetchError } = await query;

      if (cancelled) return;

      if (fetchError) {
        setError(true);
      } else if (data) {
        setMovements(data as unknown as MovementWithDetails[]);
      }
      setLoading(false);
    };
    loadMovements();

    return () => {
      cancelled = true;
    };
  }, [filter, initialized]);

  return (
    <div className="page">
      <header className="page-header flex-header">
        <div>
          <h1 className="page-title">Movimientos</h1>
          {!loading && !error && (
            <p className="page-subtitle">{movements.length} de {TOTAL_MOVEMENTS} movimientos</p>
          )}
        </div>
        <Link href="/movements/new" className="btn-add">
          +Nuevo
        </Link>
      </header>

      <section className="section">
        <div className="filter-row">
          <button
            className={`filter-btn ${filter === 'today' ? 'active' : ''}`}
            onClick={() => setFilter('today')}
          >Hoy</button>
          <button
            className={`filter-btn ${filter === 'week' ? 'active' : ''}`}
            onClick={() => setFilter('week')}
          >Semana</button>
          <button
            className={`filter-btn ${filter === 'month' ? 'active' : ''}`}
            onClick={() => setFilter('month')}
          >Mes</button>
          <button
            className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >Todo</button>
        </div>
      </section>

      <section className="section">
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
            <Spinner size={36} color="black" />
          </div>
        ) : error ? (
          <ErrorState onRetry={() => setFilter(filter)} />
        ) : movements.length === 0 ? (
          <EmptyState
            icon="💰"
            title="Sin movimientos"
            message="No hay movimientos registrados para este período"
            actionLabel="Registrar movimiento"
            onAction={() => window.location.href = '/movements/new'}
          />
        ) : (
          <ul className="movement-list">
            {movements.map((m) => (
              <li key={m.id}>
                <Link href={`/movements/${m.id}`} className="movement-item">
                  <div className="movement-main">
                    <div className="movement-info">
                      <span className="movement-type">{getMovementTypeLabel(m.type)}</span>
                      <span className="movement-contact">
                        {m.type === 'servicio' ? (
                          <>
                            {m.contact?.full_name} • {m.service?.name}
                          </>
                        ) : (
                          m.comment || '—'
                        )}
                      </span>
                    </div>
                    <div className="movement-amount">
                      <span className={`amount ${m.type === 'gasto' ? 'expense' : ''}`}>
                        {m.type === 'gasto' ? '-' : '+'}
                        {formatGuaranies(m.income - m.expense)}
                      </span>
                      <span className="movement-time">
                        {formatDate(m.created_at)} {formatTime(m.created_at)}
                      </span>
                    </div>
                  </div>
                  {m.type === 'servicio' && m.payment_method && (
                    <span className="payment-badge">{m.payment_method}</span>
                  )}
                </Link>
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

        .flex-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }

        .page-subtitle {
          font-size: 14px;
          color: var(--gray-500);
          margin-top: 4px;
        }

        .btn-add {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 10px 16px;
          background: var(--black);
          color: var(--white);
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
          min-height: 44px;
          min-width: 44px;
        }

        .filter-row {
          display: flex;
          gap: 8px;
        }

        .filter-btn {
          flex: 1;
          padding: 10px 12px;
          background: var(--white);
          border: 1px solid var(--gray-200);
          border-radius: 8px;
          font-size: 13px;
          font-weight: 500;
          color: var(--gray-600);
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .filter-btn:hover {
          border-color: var(--gray-400);
        }

        .filter-btn.active {
          background: var(--black);
          color: var(--white);
          border-color: var(--black);
        }

        .empty-state {
          text-align: center;
          padding: 48px 24px;
          color: var(--gray-500);
        }

        .empty-state p {
          margin-bottom: 16px;
        }

        .movement-list {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 1px;
          background: var(--gray-200);
          border-radius: 12px;
          overflow: hidden;
        }

        .movement-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          padding: 16px;
          background: var(--white);
          text-decoration: none;
          color: inherit;
        }

        .movement-item:active {
          background: var(--gray-50);
        }

        .movement-main {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          flex: 1;
          min-width: 0;
        }

        .movement-info {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
        }

        .movement-type {
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--gray-500);
        }

        .movement-contact {
          font-size: 14px;
          font-weight: 500;
          color: var(--black);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .movement-amount {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 4px;
          flex-shrink: 0;
        }

        .amount {
          font-size: 15px;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
        }

        .amount.expense {
          color: var(--gray-600);
        }

        .movement-time {
          font-size: 11px;
          color: var(--gray-400);
        }

        .payment-badge {
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--gray-500);
          background: var(--gray-100);
          padding: 4px 8px;
          border-radius: 4px;
          flex-shrink: 0;
        }
      `}</style>
    </div>
  );
}