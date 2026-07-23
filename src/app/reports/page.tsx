'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { formatGuaranies } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { useBranch } from '@/contexts/BranchContext';
import { getDateRange, type ViewType } from '@/lib/dateRange';

interface ServiceSummary {
  name: string;
  count: number;
  total: number;
}

interface MethodSummary {
  method: string;
  total: number;
}

interface DailySummary {
  day: string;
  total: number;
}

export default function ReportsPage() {
  const { currentBranch, initialized } = useBranch();
  const [view, setView] = useState<ViewType>('today');
  const [customRange, setCustomRange] = useState({ from: '', to: '' });
  const [selectedBranch, setSelectedBranch] = useState<string | 'all'>('all');

  const [loading, setLoading] = useState(true);
  const [totalServicios, setTotalServicios] = useState(0);
  const [totalServiciosAmount, setTotalServiciosAmount] = useState(0);
  const [totalGastos, setTotalGastos] = useState(0);
  const [balanceNeto, setBalanceNeto] = useState(0);

  const [byService, setByService] = useState<ServiceSummary[]>([]);
  const [byMethod, setByMethod] = useState<MethodSummary[]>([]);
  const [expenses, setExpenses] = useState<{ comment: string; total: number }[]>([]);
  const [dailySummary, setDailySummary] = useState<DailySummary[]>([]);

  // Update selectedBranch when currentBranch changes
  const [lastSyncedBranchId, setLastSyncedBranchId] = useState<string | null>(null);
  if (currentBranch && currentBranch.id !== lastSyncedBranchId) {
    setLastSyncedBranchId(currentBranch.id);
    setSelectedBranch(currentBranch.id);
  }

  const viewRef = useRef(view);
  const customRangeRef = useRef(customRange);
  const selectedBranchRef = useRef(selectedBranch);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  useEffect(() => {
    customRangeRef.current = customRange;
  }, [customRange]);
  useEffect(() => {
    selectedBranchRef.current = selectedBranch;
  }, [selectedBranch]);

  const handleCustomFromChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomRange((prev) => ({ ...prev, from: e.target.value }));
  };

  const handleCustomToChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomRange((prev) => ({ ...prev, to: e.target.value }));
  };

  useEffect(() => {
    // Wait for branch context to be initialized
    if (!initialized) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      const supabase = createClient();
      const { start, end } = getDateRange(viewRef.current, customRangeRef.current);
      const branchFilter = selectedBranchRef.current === 'all'
        ? undefined
        : selectedBranchRef.current;

      let serviceQuery = supabase
        .from('movements')
        .select(`
          amount_charged, income, expense, payment_method, created_at, branch_id,
          service:services(name)
        `)
        .eq('type', 'servicio')
        .gte('created_at', start)
        .lt('created_at', end);

      if (branchFilter) {
        serviceQuery = serviceQuery.eq('branch_id', branchFilter);
      }

      const { data: serviceData } = await serviceQuery;

      if (cancelled) return;

      let methodQuery = supabase
        .from('movements')
        .select('amount_charged, income, expense, payment_method')
        .eq('type', 'servicio')
        .gte('created_at', start)
        .lt('created_at', end);

      if (branchFilter) {
        methodQuery = methodQuery.eq('branch_id', branchFilter);
      }

      const { data: methodData } = await methodQuery;

      if (cancelled) return;

      let gastoQuery = supabase
        .from('movements')
        .select('expense, income, comment')
        .eq('type', 'gasto')
        .gte('created_at', start)
        .lt('created_at', end);

      if (branchFilter) {
        gastoQuery = gastoQuery.eq('branch_id', branchFilter);
      }

      const { data: gastoData } = await gastoQuery;

      if (cancelled) return;

      const serviceAgg: Record<string, { count: number; total: number }> = {};
      let serviciosCount = 0;
      let serviciosAmount = 0;

      if (serviceData) {
        for (const m of serviceData) {
          const name = (m.service as { name?: string } | null)?.name || 'Sin servicio';
          const amount = m.income || 0;
          if (!serviceAgg[name]) serviceAgg[name] = { count: 0, total: 0 };
          serviceAgg[name].count++;
          serviceAgg[name].total += amount;
          serviciosCount++;
          serviciosAmount += amount;
        }
      }

      const serviceSummaries: ServiceSummary[] = Object.entries(serviceAgg)
        .map(([name, agg]) => ({ name, count: agg.count, total: agg.total }))
        .sort((a, b) => b.total - a.total);

      const methodAgg: Record<string, number> = {};

      if (methodData) {
        for (const m of methodData) {
          const method = m.payment_method || 'sin método';
          if (!methodAgg[method]) methodAgg[method] = 0;
          methodAgg[method] += m.income || 0;
        }
      }

      const methodSummaries: MethodSummary[] = Object.entries(methodAgg)
        .map(([method, total]) => ({ method, total }))
        .sort((a, b) => b.total - a.total);

      let gastosTotal = 0;
      const gastoAgg: Record<string, number> = {};

      if (gastoData) {
        for (const m of gastoData) {
          const comment = m.comment || 'Sin descripción';
          if (!gastoAgg[comment]) gastoAgg[comment] = 0;
          gastoAgg[comment] += m.expense || 0;
          gastosTotal += m.expense || 0;
        }
      }

      const expenseList: { comment: string; total: number }[] = Object.entries(gastoAgg)
        .map(([comment, total]) => ({ comment, total }))
        .sort((a, b) => b.total - a.total);

      let dailySummaries: DailySummary[] = [];
      if (viewRef.current === 'week' && serviceData) {
        const dailyAgg: Record<string, number> = {};
        const dayNames = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do'];

        for (const day of dayNames) {
          dailyAgg[day] = 0;
        }

        for (const m of serviceData) {
          const date = new Date(m.created_at);
          const dayIndex = date.getDay() === 0 ? 6 : date.getDay() - 1;
          const dayName = dayNames[dayIndex];
          dailyAgg[dayName] += m.income || 0;
        }

        dailySummaries = dayNames.map((day) => ({ day, total: dailyAgg[day] }));
      }

      if (cancelled) return;

      const balanceNeto = serviciosAmount - gastosTotal;

      setTotalServicios(serviciosCount);
      setTotalServiciosAmount(serviciosAmount);
      setTotalGastos(gastosTotal);
      setBalanceNeto(balanceNeto);
      setByService(serviceSummaries);
      setByMethod(methodSummaries);
      setExpenses(expenseList);
      setDailySummary(dailySummaries);
      setLoading(false);
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [view, customRange, selectedBranch, initialized]);

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-title">Reportes</h1>
        <p className="page-subtitle">Arqueo de caja</p>
      </header>

      <section className="section">
        <Link href="/reports/liquidacion" className="liquidacion-link">
          Liquidación por barbero ›
        </Link>
      </section>

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
          <button
            className={`filter-btn ${view === 'custom' ? 'active' : ''}`}
            onClick={() => setView('custom')}
          >
            Personalizar
          </button>
        </div>

        {view === 'custom' && (
          <div className="custom-range">
            <input
              type="date"
              value={customRange.from}
              onChange={handleCustomFromChange}
              placeholder="Desde"
            />
            <span className="range-separator">—</span>
            <input
              type="date"
              value={customRange.to}
              onChange={handleCustomToChange}
              placeholder="Hasta"
            />
          </div>
        )}
      </section>

      {loading ? (
        <div className="empty-state">
          <p>Cargando...</p>
        </div>
      ) : (
        <>
          <section className="section">
            <div className="kpi-grid">
              <div className="kpi-card">
                <span className="kpi-label">Total Servicios</span>
                <span className="kpi-value">{totalServicios}</span>
                <span className="kpi-amount">{formatGuaranies(totalServiciosAmount)}</span>
              </div>
              <div className="kpi-card">
                <span className="kpi-label">Total Gastos</span>
                <span className="kpi-value expense">-</span>
                <span className="kpi-amount expense">{formatGuaranies(totalGastos)}</span>
              </div>
              <div className="kpi-card">
                <span className="kpi-label">Balance Neto</span>
                <span className={`kpi-value ${balanceNeto >= 0 ? 'income' : 'expense'}`}>
                  {balanceNeto >= 0 ? '+' : ''}
                </span>
                <span className={`kpi-amount ${balanceNeto >= 0 ? 'income' : 'expense'}`}>
                  {formatGuaranies(balanceNeto)}
                </span>
              </div>
            </div>
          </section>

          <section className="section">
            <div className="card">
              <h2 className="card-title">Servicios</h2>
              <ul className="breakdown-list">
                {byService.length === 0 ? (
                  <li className="breakdown-empty">Sin servicios en este período</li>
                ) : (
                  byService.map((item) => (
                    <li key={item.name} className="breakdown-row">
                      <span className="breakdown-label">{item.name}</span>
                      <span className="breakdown-count">{item.count} ×</span>
                      <span className="breakdown-amount">{formatGuaranies(item.total)}</span>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </section>

          <section className="section">
            <div className="card">
              <h2 className="card-title">Por Método</h2>
              <ul className="breakdown-list">
                {byMethod.length === 0 ? (
                  <li className="breakdown-empty">Sin métodos registrados</li>
                ) : (
                  byMethod.map((item) => (
                    <li key={item.method} className="breakdown-row">
                      <span className="breakdown-label method">{item.method}</span>
                      <span className="breakdown-amount">{formatGuaranies(item.total)}</span>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </section>

          <section className="section">
            <div className="card">
              <h2 className="card-title">Gastos</h2>
              <ul className="breakdown-list">
                {expenses.length === 0 ? (
                  <li className="breakdown-empty">Sin gastos en este período</li>
                ) : (
                  expenses.map((item) => (
                    <li key={item.comment} className="breakdown-row">
                      <span className="breakdown-label expense">{item.comment}</span>
                      <span className="breakdown-amount expense">{formatGuaranies(item.total)}</span>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </section>

          {view === 'week' && dailySummary.length > 0 && (
            <section className="section">
              <div className="card">
                <h2 className="card-title">Diario por día</h2>
                <ul className="breakdown-list">
                  {dailySummary.map((item) => (
                    <li key={item.day} className="breakdown-row daily">
                      <span className="breakdown-label day">{item.day}</span>
                      <span className="breakdown-amount">{formatGuaranies(item.total)}</span>
                    </li>
                  ))}
                  <li className="breakdown-row total">
                    <span className="breakdown-label">Total</span>
                    <span className="breakdown-amount">{formatGuaranies(totalServiciosAmount)}</span>
                  </li>
                </ul>
              </div>
            </section>
          )}
        </>
      )}

      <style>{`
        .page {
          max-width: 480px;
          margin: 0 auto;
        }

        .page-subtitle {
          font-size: 14px;
          color: var(--text-secondary);
          margin-top: 4px;
        }

        .liquidacion-link {
          display: block;
          padding: 14px 16px;
          background: var(--surface-elevated);
          border: 1px solid var(--border);
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
          text-decoration: none;
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

        .custom-range {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-top: 12px;
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

        .custom-range input {
          flex: 1;
          min-height: 44px;
        }

        .range-separator {
          color: var(--text-muted);
          font-size: 18px;
        }

        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }

        .kpi-card {
          background: var(--surface-elevated);
          border-radius: 12px;
          padding: 16px 12px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }

        .kpi-label {
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-secondary);
          margin-bottom: 8px;
        }

        .kpi-value {
          font-size: 20px;
          font-weight: 700;
          color: var(--text-primary);
        }

        .kpi-value.income {
          color: var(--text-primary);
        }

        .kpi-value.expense {
          color: var(--text-secondary);
        }

        .kpi-amount {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-secondary);
          margin-top: 4px;
        }

        .kpi-amount.income {
          color: var(--text-primary);
        }

        .kpi-amount.expense {
          color: var(--text-secondary);
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
          gap: 0;
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
          padding: 12px 0;
          border-bottom: 1px solid var(--border);
        }

        .breakdown-row:last-child {
          border-bottom: none;
        }

        .breakdown-row.daily {
          padding: 10px 0;
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

        .breakdown-label.method {
          text-transform: capitalize;
        }

        .breakdown-label.day {
          font-weight: 600;
          color: var(--text-secondary);
          width: 32px;
        }

        .breakdown-label.expense {
          color: var(--text-secondary);
        }

        .breakdown-count {
          font-size: 13px;
          color: var(--text-secondary);
          margin-right: 12px;
        }

        .breakdown-amount {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
          font-variant-numeric: tabular-nums;
        }

        .breakdown-amount.expense {
          color: var(--text-secondary);
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
