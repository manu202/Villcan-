'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { listCashClosingsForBranch } from '@/lib/data/closings';
import { useBranch } from '@/contexts/BranchContext';
import { formatDate, formatTime } from '@/lib/utils';
import { Spinner } from '@/components/Spinner';
import { Archive } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { ClosingMethodBreakdown } from './ClosingMethodBreakdown';

interface ClosingRow {
  id: string;
  closed_at: string;
  arqueo_enabled: boolean;
  calculated_efectivo: number;
  calculated_transferencia: number;
  calculated_pos: number;
  calculated_total: number;
  counted_efectivo: number | null;
  counted_transferencia: number | null;
  counted_pos: number | null;
  discrepancy_efectivo: number | null;
  discrepancy_transferencia: number | null;
  discrepancy_pos: number | null;
  branch: { name: string } | null;
  closed_by_profile: { full_name: string } | null;
}

export default function ClosingsHistoryPage() {
  const { currentBranch, initialized } = useBranch();
  const [closings, setClosings] = useState<ClosingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const currentBranchRef = useRef(currentBranch);
  useEffect(() => {
    currentBranchRef.current = currentBranch;
  }, [currentBranch]);

  useEffect(() => {
    if (!initialized) return;

    let cancelled = false;

    const load = async () => {
      const branch = currentBranchRef.current;
      if (!branch) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(false);

      const { data, error: fetchError } = await listCashClosingsForBranch(branch.id);

      if (cancelled) return;

      if (fetchError) {
        setError(true);
      } else if (data) {
        setClosings(data as unknown as ClosingRow[]);
      }
      setLoading(false);
    };
    load();

    return () => {
      cancelled = true;
    };
  }, [initialized, reloadToken]);

  return (
    <div className="page">
      <header className="page-header flex-header">
        <h1 className="page-title">Cierres de Caja</h1>
        <Link href="/closings/new" className="btn-add">
          + Cerrar
        </Link>
      </header>

      <section className="section">
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
            <Spinner size={36} color="black" />
          </div>
        ) : error ? (
          <ErrorState onRetry={() => setReloadToken((t) => t + 1)} />
        ) : closings.length === 0 ? (
          <EmptyState
            icon={Archive}
            title="Sin cierres"
            message="Todavía no se registraron cierres de caja para esta sucursal"
          />
        ) : (
          <ul className="closing-list">
            {closings.map((c) => (
              <li key={c.id} className="closing-item">
                <Link href={`/closings/${c.id}`} className="closing-item-link">
                  <div className="closing-header">
                    <span className="closing-date">
                      {formatDate(c.closed_at)} {formatTime(c.closed_at)}
                    </span>
                    <span className="closing-branch">{c.branch?.name}</span>
                  </div>
                  <div className="closing-closed-by">{c.closed_by_profile?.full_name}</div>

                  <ClosingMethodBreakdown closing={c} />
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

        .page-title {
          font-size: 24px;
          font-weight: 700;
        }

        .btn-add {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 10px 16px;
          background: var(--accent);
          color: var(--accent-foreground);
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
          min-height: 44px;
        }

        .closing-list {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .closing-item {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          overflow: hidden;
        }

        .closing-item-link {
          display: block;
          padding: 16px;
          min-height: 44px;
          color: inherit;
          text-decoration: none;
          transition: background 0.1s;
        }
        .closing-item-link:hover { background: var(--surface-elevated); }
        .closing-item-link:active { background: var(--surface-elevated); }

        .closing-header {
          display: flex;
          justify-content: space-between;
          font-size: 13px;
          color: var(--text-secondary);
          margin-bottom: 4px;
        }

        .closing-closed-by {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 12px;
        }

      `}</style>
    </div>
  );
}
