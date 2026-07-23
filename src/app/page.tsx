'use client';

import { useEffect, useState, useRef } from 'react';
import { KPICard } from '@/components/KPICard';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useBranch } from '@/contexts/BranchContext';
import { calcCashBoxKPIs, type KpiMovement, type PeriodActivity } from '@/lib/kpis';
import { getRunningCashBalance } from '@/lib/closings';
import { getDateRange, type ViewType } from '@/lib/dateRange';
import type { RunningBalance } from '@/lib/kpis';

export default function HomePage() {
  const { currentBranch, isLoading: branchLoading, initialized } = useBranch();
  const [view, setView] = useState<Exclude<ViewType, 'custom'>>('today');
  const [activity, setActivity] = useState<PeriodActivity | null>(null);
  const [running, setRunning] = useState<RunningBalance | null>(null);
  const [loading, setLoading] = useState(true);

  // Use ref to always have current branch value inside async functions
  const currentBranchRef = useRef(currentBranch);
  useEffect(() => {
    currentBranchRef.current = currentBranch;
  }, [currentBranch]);

  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    if (!initialized) return;

    let cancelled = false;

    const loadActivity = async () => {
      const branch = currentBranchRef.current;
      if (!branch) return;

      const supabase = createClient();
      const { start, end } = getDateRange(viewRef.current, { from: '', to: '' });

      const { data: serviceMovements } = await supabase
        .from('movements')
        .select('type, income, expense, payment_method, comment')
        .eq('type', 'servicio')
        .eq('branch_id', branch.id)
        .gte('created_at', start)
        .lt('created_at', end);

      const { data: expenseMovements } = await supabase
        .from('movements')
        .select('type, income, expense, payment_method, comment')
        .eq('type', 'gasto')
        .eq('branch_id', branch.id)
        .gte('created_at', start)
        .lt('created_at', end);

      if (cancelled) return;

      const movements: KpiMovement[] = [
        ...((serviceMovements || []) as KpiMovement[]),
        ...((expenseMovements || []) as KpiMovement[]),
      ];

      setActivity(calcCashBoxKPIs(movements));
    };

    const loadRunningBalance = async () => {
      const branch = currentBranchRef.current;
      if (!branch) {
        setLoading(false);
        return;
      }

      const balance = await getRunningCashBalance(branch.id);
      if (cancelled) return;

      setRunning(balance);
      setLoading(false);
    };

    loadActivity();
    loadRunningBalance();

    return () => {
      cancelled = true;
    };
  }, [initialized, view]);

  const periodLabel = view === 'today' ? 'hoy' : view === 'week' ? 'esta semana' : 'este mes';

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-title">Caja</h1>
        <p className="page-subtitle">Saldo actual · Actividad {periodLabel}</p>
      </header>

      {loading || branchLoading ? (
        <section className="section">
          <p className="page-subtitle">Cargando...</p>
        </section>
      ) : !currentBranch ? (
        <section className="section">
          <p className="page-subtitle">Selecciona una sucursal para ver los KPIs</p>
        </section>
      ) : running ? (
        <>
          <section className="section">
            <KPICard label="Balance Global" value={running.balanceGlobal} variant="highlight" size="lg" />
          </section>

          <section className="section">
            <KPICard label="Balance en Efectivo" value={running.balanceEfectivo} />
          </section>

          <section className="section">
            <div className="filter-row">
              <button
                className={`filter-btn ${view === 'today' ? 'active' : ''}`}
                onClick={() => setView('today')}
              >
                Hoy
              </button>
              <button
                className={`filter-btn ${view === 'week' ? 'active' : ''}`}
                onClick={() => setView('week')}
              >
                Semana
              </button>
              <button
                className={`filter-btn ${view === 'month' ? 'active' : ''}`}
                onClick={() => setView('month')}
              >
                Mes
              </button>
            </div>
          </section>

          {activity && (
            <>
              <section className="section">
                <h2 className="section-title">Ingresos</h2>
                <div className="kpi-grid">
                  <KPICard label="Total Ingresos" value={activity.totalIncome} />
                  <KPICard label="Efectivo" value={activity.incomeByMethod.efectivo} variant="muted" size="sm" />
                  <KPICard label="Transferencia" value={activity.incomeByMethod.transferencia} variant="muted" size="sm" />
                  <KPICard label="POS" value={activity.incomeByMethod.pos} variant="muted" size="sm" />
                </div>
              </section>

              <section className="section">
                <h2 className="section-title">Egresos</h2>
                <KPICard label="Total Gastos" value={activity.totalExpenses} />
              </section>
            </>
          )}
        </>
      ) : (
        <section className="section">
          <p className="page-subtitle">Sin datos</p>
        </section>
      )}

      <section className="section">
        <Link href="/movements/new" className="btn-primary btn-full">
          + Nuevo Movimiento
        </Link>
      </section>

      <style>{`
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
          transition: all 0.15s ease;
        }

        .filter-btn:hover {
          border-color: var(--accent-hover);
        }

        .filter-btn.active {
          background: var(--accent);
          color: var(--accent-foreground);
          border-color: var(--accent);
        }
      `}</style>
    </div>
  );
}
