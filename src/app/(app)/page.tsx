'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import {
  ChevronDown,
  Plus,
  ClipboardList,
  Lock,
  Banknote,
  Smartphone,
  CreditCard,
  ShoppingBag,
  Wallet,
  ArrowDownLeft,
  type LucideIcon,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useBranch } from '@/contexts/BranchContext';
import { calcCashBoxKPIs, type KpiMovement, type PeriodActivity } from '@/lib/kpis';
import { getRunningCashBalance } from '@/lib/closings';
import { listMovementsForBranch } from '@/lib/data/movements';
import { getDateRange, type ViewType } from '@/lib/dateRange';
import { formatGuaranies, formatRelativeTime, getMovementTypeLabel } from '@/lib/utils';
import type { RunningBalance } from '@/lib/kpis';
import type { MovementWithDetails, PaymentMethod } from '@/types';

const RECENT_MOVEMENTS_LIMIT = 5;

type IconName = 'Banknote' | 'Smartphone' | 'CreditCard' | 'ShoppingBag' | 'Wallet' | 'ArrowDownLeft';

const ICON_MAP: Record<IconName, LucideIcon> = {
  Banknote,
  Smartphone,
  CreditCard,
  ShoppingBag,
  Wallet,
  ArrowDownLeft,
};

const ICON_BG: Partial<Record<string, string>> = {
  servicio: 'rgba(16,185,129,0.12)',
  gasto: 'rgba(244,63,94,0.10)',
  apertura: 'rgba(59,130,246,0.12)',
  cierre: 'rgba(156,163,175,0.15)',
};

const ICON_COLOR: Partial<Record<string, string>> = {
  servicio: '#10b981',
  gasto: '#f43f5e',
  apertura: '#3b82f6',
  cierre: '#9ca3af',
};

function resolveIcon(movement: MovementWithDetails): IconName {
  if (movement.type === 'servicio') {
    const pm = movement.payment_method as PaymentMethod | null;
    if (pm === 'transferencia') return 'Smartphone';
    if (pm === 'pos') return 'CreditCard';
    return 'Banknote';
  }
  if (movement.type === 'gasto') return 'ShoppingBag';
  if (movement.type === 'apertura') return 'Wallet';
  return 'ArrowDownLeft'; // cierre
}

export default function HomePage() {
  const { currentBranch, isLoading: branchLoading, initialized } = useBranch();
  const [view, setView] = useState<Exclude<ViewType, 'custom'>>('today');
  const [activity, setActivity] = useState<PeriodActivity | null>(null);
  const [running, setRunning] = useState<RunningBalance | null>(null);
  const [recentMovements, setRecentMovements] = useState<MovementWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [balanceExpanded, setBalanceExpanded] = useState(false);

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

    // Best-effort: the "Movimientos recientes" card is a display convenience,
    // not core cash-box logic — if this query fails for any reason the rest
    // of the page (balance, KPIs) must still render.
    const loadRecentMovements = async () => {
      const branch = currentBranchRef.current;
      if (!branch) return;

      try {
        const { start, end } = getDateRange(viewRef.current, { from: '', to: '' });
        const { data } = await listMovementsForBranch(branch.id, start, end);
        if (cancelled) return;
        setRecentMovements(((data || []) as unknown as MovementWithDetails[]).slice(0, RECENT_MOVEMENTS_LIMIT));
      } catch {
        if (!cancelled) setRecentMovements([]);
      }
    };

    loadActivity();
    loadRunningBalance();
    loadRecentMovements();

    return () => {
      cancelled = true;
    };
  }, [initialized, view]);

  return (
    <div className="page">
      <header className="page-header">
        <span className="page-eyebrow">{currentBranch?.name ?? 'Villcan'}</span>
        <h1 className="page-title">Caja</h1>
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
            <div className="balance-card">
              <div className="balance-top">
                <div>
                  <span className="balance-label">Balance global</span>
                  <div className="balance-value">{formatGuaranies(running.balanceGlobal)}</div>
                </div>
                <button
                  type="button"
                  className={`balance-toggle ${balanceExpanded ? 'open' : ''}`}
                  aria-label="Ver desglose"
                  aria-expanded={balanceExpanded}
                  onClick={() => setBalanceExpanded((v) => !v)}
                >
                  <ChevronDown size={18} aria-hidden="true" />
                </button>
              </div>

              <div className="balance-divider" />

              {!balanceExpanded ? (
                <div className="balance-collapsed">
                  <div className="balance-mini">
                    <span className="balance-mini-label">Efectivo</span>
                    <span className="balance-mini-value">{formatGuaranies(running.balanceEfectivo)}</span>
                  </div>
                  <div className="balance-mini">
                    <span className="balance-mini-label">Ingresos {view === 'today' ? 'hoy' : view === 'week' ? 'esta semana' : 'este mes'}</span>
                    <span className="balance-mini-value">{formatGuaranies(activity?.totalIncome ?? 0)}</span>
                  </div>
                </div>
              ) : (
                <div className="balance-expanded">
                  <div className="period-tabs">
                    <button
                      type="button"
                      className={`period-tab ${view === 'today' ? 'active' : ''}`}
                      onClick={() => setView('today')}
                    >
                      Hoy
                    </button>
                    <button
                      type="button"
                      className={`period-tab ${view === 'week' ? 'active' : ''}`}
                      onClick={() => setView('week')}
                    >
                      Semana
                    </button>
                    <button
                      type="button"
                      className={`period-tab ${view === 'month' ? 'active' : ''}`}
                      onClick={() => setView('month')}
                    >
                      Mes
                    </button>
                  </div>

                  {activity && (
                    <div className="breakdown-rows">
                      <div className="breakdown-row">
                        <span>Efectivo</span>
                        <span>{formatGuaranies(activity.incomeByMethod.efectivo)}</span>
                      </div>
                      <div className="breakdown-row">
                        <span>Transferencia</span>
                        <span>{formatGuaranies(activity.incomeByMethod.transferencia)}</span>
                      </div>
                      <div className="breakdown-row">
                        <span>POS</span>
                        <span>{formatGuaranies(activity.incomeByMethod.pos)}</span>
                      </div>
                      <div className="breakdown-row breakdown-row--total">
                        <span>Total ingresos</span>
                        <span>{formatGuaranies(activity.totalIncome)}</span>
                      </div>
                      <div className="breakdown-row breakdown-row--expense">
                        <span>Egresos</span>
                        <span>{formatGuaranies(activity.totalExpenses)}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          <section className="section">
            <div className="quick-actions">
              <Link href="/movements/new" className="quick-action">
                <span className="quick-action-icon quick-action-icon--accent">
                  <Plus size={18} color="#fff" aria-hidden="true" />
                </span>
                <span className="quick-action-label">Movimiento</span>
              </Link>
              <Link href="/orders/new" className="quick-action">
                <span className="quick-action-icon quick-action-icon--dark">
                  <ClipboardList size={18} color="#fff" aria-hidden="true" />
                </span>
                <span className="quick-action-label">Pedido</span>
              </Link>
              <Link href="/closings/new" className="quick-action">
                <span className="quick-action-icon quick-action-icon--dark">
                  <Lock size={18} color="#fff" aria-hidden="true" />
                </span>
                <span className="quick-action-label">Cerrar caja</span>
              </Link>
            </div>
          </section>

          <section className="section">
            <div className="section-header-row">
              <h2 className="section-title">Movimientos recientes</h2>
              <Link href="/movements" className="section-link">Ver todos</Link>
            </div>

            {recentMovements.length > 0 ? (
              <div className="movements-card">
                {recentMovements.map((movement) => {
                  const iconName = resolveIcon(movement);
                  const Icon = ICON_MAP[iconName];
                  const iconBg = ICON_BG[movement.type] ?? 'rgba(156,163,175,0.15)';
                  const iconColor = ICON_COLOR[movement.type] ?? '#9ca3af';
                  const label = movement.service?.name ?? movement.comment ?? getMovementTypeLabel(movement.type);
                  const source = movement.contact?.full_name ?? getMovementTypeLabel(movement.type);
                  const net = movement.income > 0 ? movement.income : -movement.expense;
                  const isPositive = net >= 0;

                  return (
                    <div key={movement.id} className="movement-row">
                      <div className="movement-icon" style={{ background: iconBg }}>
                        <Icon size={18} color={iconColor} aria-hidden="true" />
                      </div>
                      <div className="movement-body">
                        <span className="movement-label">{label}</span>
                        <span className="movement-meta">
                          {source} · {formatRelativeTime(movement.created_at)}
                        </span>
                      </div>
                      <span className={`movement-amount ${isPositive ? 'movement-amount--positive' : 'movement-amount--negative'}`}>
                        {isPositive ? '+' : '−'}{formatGuaranies(Math.abs(net))}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="page-subtitle">Sin movimientos recientes</p>
            )}
          </section>
        </>
      ) : (
        <section className="section">
          <p className="page-subtitle">Sin datos</p>
        </section>
      )}

      <style>{`
        .page-header {
          display: flex;
          flex-direction: column;
        }

        .page-eyebrow {
          font-size: 13px;
          color: var(--refresh-ink-muted, var(--text-secondary));
        }

        .page-title {
          font-size: 22px;
          font-weight: 700;
          font-family: var(--refresh-font-sans, inherit);
          color: var(--refresh-ink, var(--text-primary));
        }

        .page-subtitle {
          font-size: 14px;
          color: var(--refresh-ink-secondary, var(--text-secondary));
          margin-top: 4px;
        }

        .balance-card {
          border-radius: var(--refresh-radius-card, 16px);
          padding: 26px 24px;
          background: var(--refresh-surface-glass, var(--surface));
          backdrop-filter: blur(24px) saturate(160%);
          -webkit-backdrop-filter: blur(24px) saturate(160%);
          border: var(--refresh-border-hard, 1px solid var(--border));
          box-shadow: var(--refresh-shadow-hard, var(--shadow-sm));
          font-family: var(--refresh-font-sans, inherit);
        }

        .balance-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }

        .balance-label {
          font-size: 13px;
          color: var(--refresh-ink-secondary, var(--text-secondary));
        }

        .balance-value {
          font-family: var(--refresh-font-display, inherit);
          font-size: 38px;
          line-height: 1.1;
          color: var(--refresh-ink, var(--text-primary));
        }

        .balance-toggle {
          flex-shrink: 0;
          width: 44px;
          height: 44px;
          min-width: 44px;
          min-height: 44px;
          border-radius: 8px;
          border: 2px solid rgba(36, 27, 22, 0.85);
          background: rgba(255, 255, 255, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: var(--refresh-ink, var(--text-primary));
        }

        .balance-toggle svg {
          transition: transform 0.2s ease;
        }

        .balance-toggle.open svg {
          transform: rotate(180deg);
        }

        .balance-divider {
          height: 2px;
          background: rgba(36, 27, 22, 0.85);
          margin: 18px 0;
        }

        .balance-collapsed {
          display: flex;
          justify-content: space-between;
          gap: 16px;
        }

        .balance-mini {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .balance-mini-label {
          font-size: 12px;
          color: var(--refresh-ink-muted, var(--text-secondary));
        }

        .balance-mini-value {
          font-weight: 700;
          font-size: 16px;
          color: var(--refresh-ink, var(--text-primary));
        }

        .period-tabs {
          display: flex;
          gap: 8px;
          margin-bottom: 16px;
        }

        .period-tab {
          flex: 1;
          min-height: 44px;
          padding: 10px 12px;
          background: rgba(255, 255, 255, 0.6);
          border: 2px solid rgba(36, 27, 22, 0.85);
          border-radius: var(--refresh-radius-control, 10px);
          font-size: 13px;
          font-weight: 600;
          color: var(--refresh-ink-secondary, var(--text-secondary));
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .period-tab.active {
          background: var(--refresh-accent, var(--accent));
          color: #fff;
        }

        .breakdown-rows {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .breakdown-row {
          display: flex;
          justify-content: space-between;
          font-size: 14px;
          color: var(--refresh-ink-secondary, var(--text-secondary));
        }

        .breakdown-row--total {
          font-weight: 700;
          color: var(--refresh-ink, var(--text-primary));
          padding-top: 8px;
          border-top: 2px solid rgba(36, 27, 22, 0.15);
        }

        .breakdown-row--expense span:last-child {
          color: #f43f5e;
          font-weight: 600;
        }

        .quick-actions {
          display: flex;
          gap: 10px;
        }

        .quick-action {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 14px 8px;
          min-height: 44px;
          border-radius: 12px;
          border: 2px solid rgba(36, 27, 22, 0.85);
          background: rgba(255, 255, 255, 0.55);
          text-decoration: none;
          font-family: var(--refresh-font-sans, inherit);
        }

        .quick-action-icon {
          width: 34px;
          height: 34px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .quick-action-icon--accent {
          background: var(--refresh-accent, var(--accent));
        }

        .quick-action-icon--dark {
          background: rgba(36, 27, 22, 0.85);
        }

        .quick-action-label {
          font-size: 12px;
          font-weight: 600;
          color: var(--refresh-ink, var(--text-primary));
        }

        .section-header-row {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          margin-bottom: 10px;
        }

        .section-link {
          font-size: 13px;
          font-weight: 600;
          color: var(--refresh-accent, var(--accent));
          text-decoration: none;
        }

        .movements-card {
          border-radius: var(--refresh-radius-card, 16px);
          background: var(--refresh-surface-glass, var(--surface));
          backdrop-filter: blur(20px) saturate(160%);
          -webkit-backdrop-filter: blur(20px) saturate(160%);
          border: var(--refresh-border-hard, 1px solid var(--border));
          overflow: hidden;
        }

        .movement-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          border-bottom: 2px solid rgba(36, 27, 22, 0.12);
        }

        .movement-row:last-child {
          border-bottom: none;
        }

        .movement-icon {
          flex-shrink: 0;
          width: 38px;
          height: 38px;
          border-radius: 8px;
          border: 2px solid rgba(36, 27, 22, 0.2);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .movement-body {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .movement-label {
          font-weight: 600;
          font-size: 14px;
          color: var(--refresh-ink, var(--text-primary));
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .movement-meta {
          font-size: 12px;
          color: var(--refresh-ink-muted, var(--text-secondary));
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .movement-amount {
          flex-shrink: 0;
          font-weight: 700;
          font-family: var(--refresh-font-display, inherit);
        }

        .movement-amount--positive { color: #10b981; }
        .movement-amount--negative { color: #f43f5e; }
      `}</style>
    </div>
  );
}
