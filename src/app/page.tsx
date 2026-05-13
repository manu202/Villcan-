'use client';

import { useEffect, useState } from 'react';
import { KPICard } from '@/components/KPICard';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { CashBoxKPIs } from '@/types';

export default function HomePage() {
  const [kpis, setKpis] = useState<CashBoxKPIs | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadKPIs = async () => {
      const supabase = createClient();
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const endOfDay = new Date(startOfDay);
      endOfDay.setDate(endOfDay.getDate() + 1);

      const { data: serviceMovements } = await supabase
        .from('movements')
        .select('amount_charged, income, expense, payment_method')
        .eq('type', 'servicio')
        .gte('created_at', startOfDay.toISOString())
        .lt('created_at', endOfDay.toISOString());

      const { data: expenseMovements } = await supabase
        .from('movements')
        .select('expense')
        .eq('type', 'gasto')
        .gte('created_at', startOfDay.toISOString())
        .lt('created_at', endOfDay.toISOString());

      if (serviceMovements) {
        // Efectivo: sum of ALL money received (full bills). The expense/vuelto is NOT
        // subtracted from balance because it already passed through the cash box.
        // The net effect on cash is: we receive X, we return Y as change, net = X - Y
        // But for the BALANCE IN THE BOX we track the flow: cash in = income, cash out = gastos
        const efectivo = serviceMovements
          .filter(m => m.payment_method === 'efectivo')
          .reduce((sum, m) => sum + (m.income || 0), 0);
        const transferencia = serviceMovements
          .filter(m => m.payment_method === 'transferencia')
          .reduce((sum, m) => sum + (m.income || 0), 0);
        const pos = serviceMovements
          .filter(m => m.payment_method === 'pos')
          .reduce((sum, m) => sum + (m.income || 0), 0);
        // Total "gross" income (before subtracting expenses)
        const totalIncome = efectivo + transferencia + pos;
        // Only gastos (real expenses, not service change/vuelto) reduce balance
        const totalExpenses = (expenseMovements || []).reduce((sum, m) => sum + (m.expense || 0), 0);
        // Balance = all cash received - real expenses (gastos only)
        // Note: efectivo IS income (full bills), so balanceGlobal includes full efectivo
        const balanceGlobal = efectivo + transferencia + pos - totalExpenses;
        // Efectivo balance = efectivo cash received - real cash expenses
        const balanceEfectivo = efectivo - totalExpenses;

        setKpis({
          totalIncome,
          incomeByMethod: { efectivo, transferencia, pos },
          totalExpenses,
          balanceEfectivo,
          balanceGlobal,
        });
      }

      setLoading(false);
    };
    loadKPIs();
  }, []);

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-title">Caja</h1>
        <p className="page-subtitle">Resumen del día</p>
      </header>

      {loading ? (
        <section className="section">
          <p className="page-subtitle">Cargando...</p>
        </section>
      ) : kpis ? (
        <>
          <section className="section">
            <KPICard label="Balance Global" value={kpis.balanceGlobal} variant="highlight" size="lg" />
          </section>

          <section className="section">
            <h2 className="section-title">Ingresos</h2>
            <div className="kpi-grid">
              <KPICard label="Total Ingresos" value={kpis.totalIncome} />
              <KPICard label="Efectivo" value={kpis.incomeByMethod.efectivo} variant="muted" size="sm" />
              <KPICard label="Transferencia" value={kpis.incomeByMethod.transferencia} variant="muted" size="sm" />
              <KPICard label="POS" value={kpis.incomeByMethod.pos} variant="muted" size="sm" />
            </div>
          </section>

          <section className="section">
            <h2 className="section-title">Egresos</h2>
            <KPICard label="Total Gastos" value={kpis.totalExpenses} />
          </section>

          <section className="section">
            <h2 className="section-title">Saldos</h2>
            <KPICard label="Balance en Efectivo" value={kpis.balanceEfectivo} />
          </section>
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
    </div>
  );
}