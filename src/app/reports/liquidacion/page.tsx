'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { formatGuaranies } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { useBranch } from '@/contexts/BranchContext';
import { useSettings } from '@/contexts/SettingsContext';
import { computeLiquidacionByBarber, type LiquidacionRow } from '@/lib/liquidacion';

type ViewType = 'today' | 'week' | 'month' | 'custom';

const getDateRange = (view: ViewType, customRange: { from: string; to: string }): { start: string; end: string } => {
  const now = new Date();

  switch (view) {
    case 'today': {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      return { start: start.toISOString(), end: end.toISOString() };
    }
    case 'week': {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      return { start: start.toISOString(), end: end.toISOString() };
    }
    case 'month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      return { start: start.toISOString(), end: end.toISOString() };
    }
    case 'custom': {
      if (!customRange.from || !customRange.to) {
        return { start: now.toISOString(), end: now.toISOString() };
      }
      const start = new Date(customRange.from);
      const end = new Date(customRange.to);
      end.setDate(end.getDate() + 1);
      return { start: start.toISOString(), end: end.toISOString() };
    }
  }
};

interface MovementRow {
  amount_charged: number | null;
  commission_pct: number | null;
  user_id: string;
  user: { full_name?: string } | { full_name?: string }[] | null;
}

export default function LiquidacionPage() {
  const { currentBranch, initialized } = useBranch();
  const { settings } = useSettings();
  const [view, setView] = useState<ViewType>('today');
  const [customRange, setCustomRange] = useState({ from: '', to: '' });
  const [selectedBranch, setSelectedBranch] = useState<string | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<LiquidacionRow[]>([]);

  const [lastSyncedBranchId, setLastSyncedBranchId] = useState<string | null>(null);
  if (currentBranch && currentBranch.id !== lastSyncedBranchId) {
    setLastSyncedBranchId(currentBranch.id);
    setSelectedBranch(currentBranch.id);
  }

  const viewRef = useRef(view);
  const customRangeRef = useRef(customRange);
  const selectedBranchRef = useRef(selectedBranch);
  useEffect(() => { viewRef.current = view; }, [view]);
  useEffect(() => { customRangeRef.current = customRange; }, [customRange]);
  useEffect(() => { selectedBranchRef.current = selectedBranch; }, [selectedBranch]);

  useEffect(() => {
    if (!initialized) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      const supabase = createClient();
      const { start, end } = getDateRange(viewRef.current, customRangeRef.current);
      const branchFilter = selectedBranchRef.current === 'all' ? undefined : selectedBranchRef.current;

      let query = supabase
        .from('movements')
        .select(`
          amount_charged, commission_pct, user_id,
          user:profiles(full_name)
        `)
        .eq('type', 'servicio')
        .gte('created_at', start)
        .lt('created_at', end);

      if (branchFilter) {
        query = query.eq('branch_id', branchFilter);
      }

      const { data } = await query;

      if (cancelled) return;

      const movementInputs = ((data ?? []) as MovementRow[]).map((m) => {
        const userJoin = Array.isArray(m.user) ? m.user[0] : m.user;
        return {
          user_id: m.user_id,
          userName: userJoin?.full_name ?? 'Sin nombre',
          amountCharged: m.amount_charged ?? 0,
          commissionPct: m.commission_pct,
        };
      });

      setRows(computeLiquidacionByBarber(movementInputs));
      setLoading(false);
    };

    load();

    return () => { cancelled = true; };
  }, [view, customRange, selectedBranch, initialized]);

  const totalFacturado = rows.reduce((sum, r) => sum + r.facturado, 0);
  const totalCommission = rows.reduce((sum, r) => sum + r.commission, 0);

  return (
    <div className="page">
      <header className="page-header">
        <Link href="/reports" className="back-link">← Reportes</Link>
        <h1 className="page-title">Liquidación por barbero</h1>
      </header>

      <section className="section">
        <div className="branch-filter">
          <select
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value as string | 'all')}
            className="select"
          >
            <option value="all">Todas las sucursales</option>
            {currentBranch && <option value={currentBranch.id}>{currentBranch.name}</option>}
          </select>
        </div>
      </section>

      <section className="section">
        <div className="filter-row">
          <button className={`filter-btn ${view === 'today' ? 'active' : ''}`} onClick={() => setView('today')}>Hoy</button>
          <button className={`filter-btn ${view === 'week' ? 'active' : ''}`} onClick={() => setView('week')}>Semana</button>
          <button className={`filter-btn ${view === 'month' ? 'active' : ''}`} onClick={() => setView('month')}>Mes</button>
          <button className={`filter-btn ${view === 'custom' ? 'active' : ''}`} onClick={() => setView('custom')}>Personalizar</button>
        </div>

        {view === 'custom' && (
          <div className="custom-range">
            <input
              type="date"
              value={customRange.from}
              onChange={(e) => setCustomRange((prev) => ({ ...prev, from: e.target.value }))}
            />
            <span className="range-separator">—</span>
            <input
              type="date"
              value={customRange.to}
              onChange={(e) => setCustomRange((prev) => ({ ...prev, to: e.target.value }))}
            />
          </div>
        )}
      </section>

      {loading ? (
        <div className="empty-state">
          <p>Cargando...</p>
        </div>
      ) : (
        <section className="section">
          <div className="card">
            <h2 className="card-title">Por barbero</h2>
            <ul className="breakdown-list">
              {rows.length === 0 ? (
                <li className="breakdown-empty">Sin servicios en este período</li>
              ) : (
                rows.map((r) => (
                  <li key={r.userId} className="breakdown-row">
                    <span className="breakdown-label">{r.userName}</span>
                    <span className="breakdown-amount">{formatGuaranies(r.facturado)}</span>
                    {settings.commissions_enabled && (
                      <span className="breakdown-commission">{formatGuaranies(r.commission)}</span>
                    )}
                  </li>
                ))
              )}
              {rows.length > 0 && (
                <li className="breakdown-row total">
                  <span className="breakdown-label">Total</span>
                  <span className="breakdown-amount">{formatGuaranies(totalFacturado)}</span>
                  {settings.commissions_enabled && (
                    <span className="breakdown-commission">{formatGuaranies(totalCommission)}</span>
                  )}
                </li>
              )}
            </ul>
          </div>
        </section>
      )}

      <style>{`
        .page {
          max-width: 480px;
          margin: 0 auto;
        }

        .back-link {
          display: inline-block;
          font-size: 14px;
          color: var(--text-secondary);
          text-decoration: none;
          margin-bottom: 8px;
        }

        .page-title {
          font-size: 24px;
          font-weight: 700;
        }

        .branch-filter {
          margin-bottom: 12px;
        }

        .select {
          width: 100%;
          padding: 10px 12px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 8px;
          font-size: 14px;
          color: var(--text-primary);
          cursor: pointer;
          min-height: 44px;
        }

        .filter-row {
          display: flex;
          gap: 8px;
        }

        .filter-btn {
          flex: 1;
          padding: 10px 12px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 8px;
          font-size: 13px;
          font-weight: 500;
          color: var(--text-secondary);
          cursor: pointer;
        }

        .filter-btn.active {
          background: var(--accent);
          color: var(--accent-foreground);
          border-color: var(--accent);
        }

        .custom-range {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-top: 12px;
        }

        .custom-range input {
          flex: 1;
          min-height: 44px;
        }

        .range-separator {
          color: var(--text-muted);
          font-size: 18px;
        }

        .card {
          background: var(--surface-elevated);
          border-radius: 12px;
          padding: 20px;
        }

        .card-title {
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text-secondary);
          margin-bottom: 16px;
        }

        .breakdown-list {
          list-style: none;
          display: flex;
          flex-direction: column;
        }

        .breakdown-empty {
          font-size: 14px;
          color: var(--text-muted);
          text-align: center;
          padding: 24px 0;
        }

        .breakdown-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 0;
          border-bottom: 1px solid var(--border);
        }

        .breakdown-row:last-child {
          border-bottom: none;
        }

        .breakdown-row.total {
          border-top: 2px solid var(--border);
          margin-top: 8px;
          padding-top: 12px;
        }

        .breakdown-label {
          flex: 1;
          font-size: 14px;
          font-weight: 500;
          color: var(--text-primary);
        }

        .breakdown-amount {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
          font-variant-numeric: tabular-nums;
        }

        .breakdown-commission {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-secondary);
          font-variant-numeric: tabular-nums;
        }

        .empty-state {
          text-align: center;
          padding: 48px 24px;
          color: var(--text-secondary);
        }
      `}</style>
    </div>
  );
}
