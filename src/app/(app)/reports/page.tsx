'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { formatGuaranies } from '@/lib/utils';
import { useBranch } from '@/contexts/BranchContext';
import { useSettings } from '@/contexts/SettingsContext';
import { getDateRange, type ViewType } from '@/lib/dateRange';
import { computeCashBalance, type CashBalanceMovement } from '@/lib/cashBalance';
import {
  listServicioMovementsForReports,
  listOrderItemsForOrders,
  listGastoMovementsForReports,
  listAperturaMovementsForReports,
  listCierreMovementsForReports,
  listServicioIncomeForPrevPeriod,
} from '@/lib/data/reports';

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

// Hand-rolled bar+line chart geometry for the dark "Total ingresos" card —
// mirrors the canvas's raw inline SVG (no charting library). Bars are
// scaled to the max value in `data`; the polyline connects each bar's
// center-top point. Layout constants match the canvas's 310x90 viewBox
// with 7 slots of width 40 (30 bar + 10 gap).
const CHART_VIEWBOX_H = 90;
const CHART_BAR_W = 30;
const CHART_SLOT_W = 40;

function computeChartGeometry(data: DailySummary[]) {
  const max = Math.max(1, ...data.map((d) => d.total));
  const bars = data.map((d, i) => {
    const h = Math.max(2, (d.total / max) * CHART_VIEWBOX_H);
    const x = i * CHART_SLOT_W;
    const y = CHART_VIEWBOX_H - h;
    return { x, y, width: CHART_BAR_W, height: h };
  });
  const points = bars
    .map((b) => `${b.x + b.width / 2},${b.y}`)
    .join(' ');
  const viewBoxWidth = data.length > 0 ? data.length * CHART_SLOT_W - (CHART_SLOT_W - CHART_BAR_W) : 0;
  return { bars, points, viewBoxWidth };
}

function getPrevDateRange(view: ViewType): { start: string; end: string } | null {
  const now = new Date();
  switch (view) {
    case 'today': {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return { start: start.toISOString(), end: end.toISOString() };
    }
    case 'week': {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 13);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      return { start: start.toISOString(), end: end.toISOString() };
    }
    case 'month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: start.toISOString(), end: end.toISOString() };
    }
    default:
      return null;
  }
}

export default function ReportsPage() {
  const { currentBranch, branches, initialized } = useBranch();
  const { settings } = useSettings();
  const [view, setView] = useState<ViewType>('today');
  const [customRange, setCustomRange] = useState({ from: '', to: '' });
  const [selectedBranch, setSelectedBranch] = useState<string | 'all'>('all');

  const [loading, setLoading] = useState(true);
  const [totalServicios, setTotalServicios] = useState(0);
  const [totalServiciosAmount, setTotalServiciosAmount] = useState(0);
  const [totalGastos, setTotalGastos] = useState(0);
  const [balanceNeto, setBalanceNeto] = useState(0);
  const [prevServiciosAmount, setPrevServiciosAmount] = useState(0);

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
      const { start, end } = getDateRange(viewRef.current, customRangeRef.current);

      // Custom range with incomplete dates — show empty without querying
      if (!start || !end) {
        setLoading(false);
        return;
      }

      const branchFilter = selectedBranchRef.current === 'all'
        ? undefined
        : selectedBranchRef.current;

      const { data: serviceData } = await listServicioMovementsForReports(start, end, branchFilter);

      if (cancelled) return;

      // methodData is a subset of serviceData — reuse instead of a second fetch
      const methodData = serviceData;

      // QA-3 (2026-09-22): every order-derived 'servicio' movement has
      // service_id NULL — an order can have several services, so
      // complete_order_payment never sets a single one on the movement row
      // (see 20260922020000_atomic_order_payment_completion.sql). The
      // movements.service join above (`service:services(name)`) is now
      // always null and only kept because methodData/serviciosCount below
      // still legitimately read other columns off the same rows. The real
      // per-service breakdown has to come from order_items instead,
      // fetched by the order_ids these same movements already point to —
      // reusing them keeps the item breakdown scoped to exactly the same
      // period/branch movements already being counted, with no separate
      // date/branch filter to keep in sync.
      const orderIds = (serviceData || [])
        .map((m) => (m as { order_id?: string | null }).order_id)
        .filter((id): id is string => !!id);

      let itemsData: { name_snapshot: string; line_total: number; qty: number }[] = [];
      if (orderIds.length > 0) {
        const { data } = await listOrderItemsForOrders(orderIds);
        itemsData = data || [];
      }

      if (cancelled) return;

      const { data: gastoData } = await listGastoMovementsForReports(start, end, branchFilter);

      if (cancelled) return;

      // apertura/cierre are needed for balanceNeto (via computeCashBalance)
      // even though no other card on this page displays them directly.
      const { data: aperturaData } = await listAperturaMovementsForReports(start, end, branchFilter);

      if (cancelled) return;

      const { data: cierreData } = await listCierreMovementsForReports(start, end, branchFilter);

      if (cancelled) return;

      // Per-order totals (KPI/ticket promedio) — one entry per completed
      // order, unrelated to how many line items/services it contained.
      let serviciosCount = 0;
      let serviciosAmount = 0;
      if (serviceData) {
        for (const m of serviceData) {
          serviciosCount++;
          serviciosAmount += m.income || 0;
        }
      }

      // Per-service breakdown (the "Servicios" card) — from order_items,
      // not the movement's own (always-null) service_id. `qty`/`line_total`
      // are per line item, so a 2-service order contributes to both names.
      const serviceAgg: Record<string, { count: number; total: number }> = {};
      for (const item of itemsData) {
        const name = item.name_snapshot || 'Sin servicio';
        if (!serviceAgg[name]) serviceAgg[name] = { count: 0, total: 0 };
        serviceAgg[name].count += item.qty;
        serviceAgg[name].total += item.line_total;
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

      // Balance Neto = money in any form, net of ALL expenses (see
      // computeCashBalance's `global`, src/lib/cashBalance.ts) — apertura,
      // the cash-vs-bank split on gastos, and cierre withdrawals all matter
      // here; the old `serviciosAmount - gastosTotal` formula ignored all
      // three, which is why this page could disagree with the dashboard
      // and the arqueo/ClosingForm balance for the same period (M-3).
      const cashMovements: CashBalanceMovement[] = [
        ...(serviceData || []).map((m): CashBalanceMovement => ({
          type: 'servicio',
          income: m.income || 0,
          expense: 0,
          payment_method: m.payment_method,
          comment: null,
        })),
        ...(gastoData || []).map((m): CashBalanceMovement => ({
          type: 'gasto',
          income: 0,
          expense: m.expense || 0,
          payment_method: null,
          comment: m.comment,
        })),
        ...(aperturaData || []).map((m): CashBalanceMovement => ({
          type: 'apertura',
          income: m.income || 0,
          expense: 0,
          payment_method: null,
          comment: null,
        })),
        ...(cierreData || []).map((m): CashBalanceMovement => ({
          type: 'cierre',
          income: 0,
          expense: m.expense || 0,
          payment_method: null,
          comment: null,
        })),
      ];
      const balanceNeto = computeCashBalance(cashMovements).global;

      // Fetch previous period for comparison (skip for custom/all views)
      const prevRange = getPrevDateRange(viewRef.current);
      let prevAmount = 0;
      if (prevRange) {
        const { data: prevData } = await listServicioIncomeForPrevPeriod(
          prevRange.start,
          prevRange.end,
          branchFilter
        );
        if (!cancelled && prevData) {
          prevAmount = prevData.reduce((s: number, m: { income: number | null }) => s + (m.income || 0), 0);
        }
      }

      if (cancelled) return;

      setTotalServicios(serviciosCount);
      setTotalServiciosAmount(serviciosAmount);
      setTotalGastos(gastosTotal);
      setBalanceNeto(balanceNeto);
      setPrevServiciosAmount(prevAmount);
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

  const servicesLabel = settings.services_label || 'Servicios';
  const staffLabelLower = (settings.staff_label || 'Barbero').toLowerCase();

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-title">Reportes</h1>
        <p className="page-subtitle">Análisis de ventas</p>
      </header>

      <section className="section">
        <div className="branch-filter">
          <select
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value as string | 'all')}
            className="select"
          >
            <option value="all">Todas las sucursales</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
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
          <>
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
            {(customRange.from || customRange.to) && (!customRange.from || !customRange.to) && (
              <p className="range-warning">Completá las dos fechas para ver los resultados.</p>
            )}
          </>
        )}
      </section>

      {loading ? (
        <div className="empty-state">
          <p>Cargando...</p>
        </div>
      ) : (
        <>
          {(() => {
            const ticketPromedio = totalServicios > 0 ? Math.round(totalServiciosAmount / totalServicios) : 0;
            const canCompare = view !== 'custom' && view !== 'all';
            const ingresosPct = canCompare && prevServiciosAmount > 0
              ? Math.round(((totalServiciosAmount - prevServiciosAmount) / prevServiciosAmount) * 100)
              : null;
            const chart = computeChartGeometry(dailySummary);
            const periodLabel = view === 'today' ? 'Hoy' : view === 'week' ? 'Semana' : view === 'month' ? 'Mes' : 'Personalizado';

            return (
              <>
                <section className="section">
                  <div className="chart-card">
                    <span className="chart-eyebrow">{`Total ingresos — ${periodLabel}`}</span>
                    <div className="chart-total">{formatGuaranies(totalServiciosAmount)}</div>

                    {dailySummary.length > 0 && (
                      <>
                        <svg
                          className="chart-svg"
                          width="100%"
                          height="90"
                          viewBox={`0 0 ${chart.viewBoxWidth} ${CHART_VIEWBOX_H}`}
                          preserveAspectRatio="none"
                        >
                          {chart.bars.map((bar, i) => (
                            <rect
                              key={dailySummary[i].day + i}
                              x={bar.x}
                              y={bar.y}
                              width={bar.width}
                              height={bar.height}
                              fill="var(--refresh-accent, #E85D2C)"
                            />
                          ))}
                          <polyline
                            points={chart.points}
                            fill="none"
                            stroke="var(--refresh-bg, #FBF3EC)"
                            strokeWidth="2.5"
                            strokeLinecap="square"
                            strokeLinejoin="miter"
                          />
                        </svg>
                        <div className="chart-days">
                          {dailySummary.map((d) => (
                            <span key={d.day}>{d.day}</span>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </section>

                <section className="section">
                  <div className="kpi-grid">
                    <div className="kpi-tile accent">
                      <span className="kpi-tile-label">{`Total ${servicesLabel}`}</span>
                      <span className="kpi-tile-value">{totalServicios}</span>
                      {ingresosPct !== null && (
                        <span className={`kpi-badge ${ingresosPct >= 0 ? 'up' : 'down'}`}>
                          {ingresosPct >= 0 ? '↑' : '↓'}{Math.abs(ingresosPct)}%
                        </span>
                      )}
                    </div>
                    <div className="kpi-tile accent">
                      <span className="kpi-tile-label">Ticket Prom.</span>
                      <span className="kpi-tile-value">
                        {totalServicios > 0 ? formatGuaranies(ticketPromedio) : 'Sin datos'}
                      </span>
                    </div>
                    <div className="kpi-tile glass">
                      <span className="kpi-tile-label muted">Balance Neto</span>
                      <span className={`kpi-tile-sign ${balanceNeto >= 0 ? 'income' : 'expense'}`}>
                        {balanceNeto >= 0 ? '+' : '−'}
                      </span>
                      <span className={`kpi-tile-value ${balanceNeto >= 0 ? 'income' : 'expense'}`}>
                        {formatGuaranies(Math.abs(balanceNeto))}
                      </span>
                    </div>
                  </div>
                </section>
              </>
            );
          })()}

          <section className="section">
            <Link href="/reports/liquidacion" className="nav-link-card">
              {`Liquidación por ${staffLabelLower} ›`}
            </Link>
          </section>

          <section className="section">
            <div className="card">
              <h2 className="card-title">{settings.services_label}</h2>
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
            <div className="grouped-card">
              <h2 className="grouped-card-title">Por Método</h2>
              {byMethod.length === 0 ? (
                <p className="grouped-card-empty">Sin métodos registrados</p>
              ) : (
                byMethod.map((item) => (
                  <div key={item.method} className="grouped-card-row">
                    <span className="grouped-card-label method">{item.method}</span>
                    <span className="grouped-card-amount">{formatGuaranies(item.total)}</span>
                  </div>
                ))
              )}
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

        .filter-row {
          display: flex;
          gap: 8px;
        }

        .filter-btn {
          flex: 1;
          padding: 10px 12px;
          min-height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--refresh-surface-glass, var(--surface));
          border: var(--refresh-border-hard, 1px solid var(--border));
          border-radius: var(--refresh-radius-control, 8px);
          font-size: 13px;
          font-weight: 600;
          color: var(--refresh-ink-secondary, var(--text-secondary));
          cursor: pointer;
          transition: all 0.15s ease;
          font-family: var(--refresh-font-sans, inherit);
        }

        .filter-btn:hover {
          border-color: var(--refresh-accent-hover, var(--accent-hover));
        }

        .filter-btn.active {
          background: var(--refresh-accent, var(--accent));
          color: #fff;
          border-color: var(--refresh-accent, var(--accent));
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
          background: var(--refresh-surface-glass, var(--surface));
          border: var(--refresh-border-hard, 1px solid var(--border));
          border-radius: var(--refresh-radius-control, 8px);
          font-size: 14px;
          color: var(--refresh-ink, var(--text-primary));
          cursor: pointer;
          min-height: 44px;
          font-family: var(--refresh-font-sans, inherit);
        }

        .custom-range input {
          flex: 1;
          min-height: 44px;
        }

        .range-separator {
          color: var(--text-muted);
          font-size: 18px;
        }

        .range-warning {
          font-size: 13px;
          color: var(--text-secondary);
          margin-top: 8px;
          padding: 8px 12px;
          background: var(--surface-elevated);
          border-radius: 6px;
          border-left: 3px solid var(--accent);
        }

        /* Dark "Total ingresos" chart card — the canvas's one intentionally
           dark surface, present in every theme (not a dark-mode thing). */
        .chart-card {
          background: var(--refresh-ink, #241b16);
          border: var(--refresh-border-hard, none);
          border-radius: var(--refresh-radius-card, 16px);
          padding: 22px 20px;
          box-shadow: 6px 6px 0 rgba(232, 93, 44, 0.35);
        }

        .chart-eyebrow {
          display: block;
          font-size: 12px;
          color: rgba(251, 243, 236, 0.6);
          font-family: var(--refresh-font-sans, inherit);
        }

        .chart-total {
          font-family: var(--refresh-font-display, inherit);
          font-size: 32px;
          color: var(--refresh-bg, #fbf3ec);
          margin-top: 2px;
        }

        .chart-svg {
          display: block;
          margin-top: 16px;
        }

        .chart-days {
          display: flex;
          justify-content: space-between;
          font-size: 10px;
          color: rgba(251, 243, 236, 0.5);
          margin-top: 6px;
          font-family: var(--refresh-font-sans, inherit);
        }

        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }

        .kpi-tile {
          border-radius: var(--refresh-radius-control, 14px);
          padding: 16px 12px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          border: var(--refresh-border-hard, 1px solid var(--border));
        }

        .kpi-tile.accent {
          background: var(--refresh-accent, var(--surface-elevated));
          box-shadow: var(--refresh-shadow-hard-sm, none);
        }

        .kpi-tile.glass {
          background: var(--refresh-surface-glass, var(--surface-elevated));
          backdrop-filter: blur(20px) saturate(160%);
          -webkit-backdrop-filter: blur(20px) saturate(160%);
        }

        .kpi-tile-label {
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: rgba(255, 248, 243, 0.85);
          margin-bottom: 8px;
          font-family: var(--refresh-font-sans, inherit);
        }

        .kpi-tile-label.muted {
          color: var(--refresh-ink-secondary, var(--text-secondary));
        }

        .kpi-tile-value {
          font-family: var(--refresh-font-display, inherit);
          font-size: 18px;
          color: var(--refresh-bg, #fff8f3);
        }

        .kpi-tile-sign {
          font-family: var(--refresh-font-display, inherit);
          font-size: 20px;
        }

        .kpi-tile-value.income {
          color: var(--refresh-ink, var(--text-primary));
        }

        .kpi-tile-value.expense {
          color: var(--refresh-ink-secondary, var(--text-secondary));
        }

        .kpi-tile-sign.income {
          color: var(--refresh-ink, var(--text-primary));
        }

        .kpi-tile-sign.expense {
          color: var(--refresh-ink-secondary, var(--text-secondary));
        }

        .kpi-badge {
          font-size: 10px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 100px;
          margin-top: 6px;
          background: rgba(255, 248, 243, 0.2);
          color: #fff8f3;
        }

        .nav-link-card {
          display: block;
          background: var(--refresh-surface-glass, var(--surface-elevated));
          backdrop-filter: blur(20px) saturate(160%);
          -webkit-backdrop-filter: blur(20px) saturate(160%);
          border: var(--refresh-border-hard, 1px solid var(--border));
          border-radius: var(--refresh-radius-card, 12px);
          padding: 16px 20px;
          min-height: 44px;
          font-size: 14px;
          font-weight: 600;
          color: var(--refresh-ink, var(--text-primary));
          text-decoration: none;
          font-family: var(--refresh-font-sans, inherit);
        }

        .grouped-card {
          background: var(--refresh-surface-glass, var(--surface-elevated));
          backdrop-filter: blur(20px) saturate(160%);
          -webkit-backdrop-filter: blur(20px) saturate(160%);
          border: var(--refresh-border-hard, none);
          border-radius: var(--refresh-radius-card, 16px);
          overflow: hidden;
        }

        .grouped-card-title {
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--refresh-ink-secondary, var(--text-secondary));
          padding: 16px 16px 0;
        }

        .grouped-card-empty {
          font-size: 14px;
          color: var(--refresh-ink-muted, var(--text-muted));
          text-align: center;
          padding: 24px 16px;
        }

        .grouped-card-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 14px 16px;
          border-bottom: 2px solid rgba(36, 27, 22, 0.12);
        }

        .grouped-card-row:last-child {
          border-bottom: none;
        }

        .grouped-card-label {
          font-weight: 600;
          color: var(--refresh-ink, var(--text-primary));
        }

        .grouped-card-label.method {
          text-transform: capitalize;
        }

        .grouped-card-amount {
          font-weight: 700;
          color: var(--refresh-ink, var(--text-primary));
          font-variant-numeric: tabular-nums;
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
