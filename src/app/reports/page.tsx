'use client';

import { useEffect, useState, useCallback } from 'react';
import { formatGuaranies } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';

type ViewType = 'today' | 'week' | 'month' | 'custom';

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

export default function ReportsPage() {
  const [view, setView] = useState<ViewType>('today');
  const [customRange, setCustomRange] = useState({ from: '', to: '' });

  const [loading, setLoading] = useState(true);
  const [totalServicios, setTotalServicios] = useState(0);
  const [totalServiciosAmount, setTotalServiciosAmount] = useState(0);
  const [totalGastos, setTotalGastos] = useState(0);
  const [balanceNeto, setBalanceNeto] = useState(0);

  const [byService, setByService] = useState<ServiceSummary[]>([]);
  const [byMethod, setByMethod] = useState<MethodSummary[]>([]);
  const [expenses, setExpenses] = useState<{ comment: string; total: number }[]>([]);
  const [dailySummary, setDailySummary] = useState<DailySummary[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { start, end } = getDateRange(view, customRange);

    // Query: servicios grouped by service
    const { data: serviceData } = await supabase
      .from('movements')
      .select(`
        income, created_at,
        service:services(name)
      `)
      .eq('type', 'servicio')
      .gte('created_at', start)
      .lt('created_at', end);

    // Query: payment methods for servicios
    const { data: methodData } = await supabase
      .from('movements')
      .select('income, payment_method')
      .eq('type', 'servicio')
      .gte('created_at', start)
      .lt('created_at', end);

    // Query: gastos
    const { data: gastoData } = await supabase
      .from('movements')
      .select('expense, comment')
      .eq('type', 'gasto')
      .gte('created_at', start)
      .lt('created_at', end);

    // Aggregate servicios
    const serviceAgg: Record<string, { count: number; total: number }> = {};
    let serviciosCount = 0;
    let serviciosAmount = 0;

    if (serviceData) {
      for (const m of serviceData) {
        const name = (m.service as { name?: string } | null)?.name || 'Sin servicio';
        if (!serviceAgg[name]) serviceAgg[name] = { count: 0, total: 0 };
        serviceAgg[name].count++;
        serviceAgg[name].total += m.income || 0;
        serviciosCount++;
        serviciosAmount += m.income || 0;
      }
    }

    const serviceSummaries: ServiceSummary[] = Object.entries(serviceAgg)
      .map(([name, agg]) => ({ name, count: agg.count, total: agg.total }))
      .sort((a, b) => b.total - a.total);

    // Aggregate by payment method
    const methodAgg: Record<string, number> = {};
    let totalByMethod = 0;

    if (methodData) {
      for (const m of methodData) {
        const method = m.payment_method || 'sin método';
        if (!methodAgg[method]) methodAgg[method] = 0;
        methodAgg[method] += m.income || 0;
        totalByMethod += m.income || 0;
      }
    }

    const methodSummaries: MethodSummary[] = Object.entries(methodAgg)
      .map(([method, total]) => ({ method, total }))
      .sort((a, b) => b.total - a.total);

    // Aggregate gastos
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

    // Daily breakdown (for week view)
    let dailySummaries: DailySummary[] = [];
    if (view === 'week' && serviceData) {
      const dailyAgg: Record<string, number> = {};
      const dayNames = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do'];

      // Initialize all days
      for (const day of dayNames) {
        dailyAgg[day] = 0;
      }

      for (const m of serviceData) {
        const date = new Date(m.created_at);
        const dayIndex = date.getDay() === 0 ? 6 : date.getDay() - 1; // Convert Sunday=0 to Lu=0
        const dayName = dayNames[dayIndex];
        dailyAgg[dayName] += m.income || 0;
      }

      dailySummaries = dayNames.map((day) => ({ day, total: dailyAgg[day] }));
    }

    setTotalServicios(serviciosCount);
    setTotalServiciosAmount(serviciosAmount);
    setTotalGastos(gastosTotal);
    setBalanceNeto(serviciosAmount - gastosTotal);

    setByService(serviceSummaries);
    setByMethod(methodSummaries);
    setExpenses(expenseList);
    setDailySummary(dailySummaries);
    setLoading(false);
  }, [view, customRange]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCustomFromChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomRange((prev) => ({ ...prev, from: e.target.value }));
  };

  const handleCustomToChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomRange((prev) => ({ ...prev, to: e.target.value }));
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-title">Reportes</h1>
        <p className="page-subtitle">Arqueo de caja</p>
      </header>

      {/* Date Range Tabs */}
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
          {/* Summary Cards */}
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

          {/* Servicios Breakdown */}
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

          {/* Payment Methods Breakdown */}
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

          {/* Gastos Breakdown */}
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

          {/* Daily Breakdown (week view only) */}
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
          color: var(--gray-500);
          margin-top: 4px;
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
          color: var(--gray-400);
          font-size: 18px;
        }

        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }

        .kpi-card {
          background: var(--gray-50);
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
          color: var(--gray-500);
          margin-bottom: 8px;
        }

        .kpi-value {
          font-size: 20px;
          font-weight: 700;
          color: var(--black);
        }

        .kpi-value.income {
          color: var(--black);
        }

        .kpi-value.expense {
          color: var(--gray-600);
        }

        .kpi-amount {
          font-size: 12px;
          font-weight: 600;
          color: var(--gray-600);
          margin-top: 4px;
        }

        .kpi-amount.income {
          color: var(--black);
        }

        .kpi-amount.expense {
          color: var(--gray-600);
        }

        .card {
          background: var(--gray-50);
          border-radius: 12px;
          padding: 20px;
        }

        .card-title {
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--gray-500);
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
          color: var(--gray-400);
          text-align: center;
          padding: 24px 0;
        }

        .breakdown-row {
          display: flex;
          align-items: center;
          padding: 12px 0;
          border-bottom: 1px solid var(--gray-200);
        }

        .breakdown-row:last-child {
          border-bottom: none;
        }

        .breakdown-row.daily {
          padding: 10px 0;
        }

        .breakdown-row.total {
          border-top: 2px solid var(--gray-300);
          margin-top: 8px;
          padding-top: 12px;
        }

        .breakdown-label {
          flex: 1;
          font-size: 14px;
          font-weight: 500;
          color: var(--black);
        }

        .breakdown-label.method {
          text-transform: capitalize;
        }

        .breakdown-label.day {
          font-weight: 600;
          color: var(--gray-600);
          width: 32px;
        }

        .breakdown-label.expense {
          color: var(--gray-700);
        }

        .breakdown-count {
          font-size: 13px;
          color: var(--gray-500);
          margin-right: 12px;
        }

        .breakdown-amount {
          font-size: 14px;
          font-weight: 600;
          color: var(--black);
          font-variant-numeric: tabular-nums;
        }

        .breakdown-amount.expense {
          color: var(--gray-600);
        }

        .empty-state {
          text-align: center;
          padding: 48px 24px;
          color: var(--gray-500);
        }
      `}</style>
    </div>
  );
}