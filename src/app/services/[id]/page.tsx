'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatGuaranies, formatDate } from '@/lib/utils';
import type { Service, MovementWithDetails } from '@/types';

export default function ServiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const serviceId = params.id as string;

  const [service, setService] = useState<Service | null>(null);
  const [movements, setMovements] = useState<MovementWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!serviceId) return;

    async function fetchData() {
      const supabase = createClient();

      const [serviceRes, movementsRes] = await Promise.all([
        supabase
          .from('services')
          .select('id, name, price, is_active, created_at, branch_id')
          .eq('id', serviceId)
          .single(),
        supabase
          .from('movements')
          .select(`
            id, contact:contacts(full_name), payment_method, amount_charged,
            income, expense, created_at
          `)
          .eq('service_id', serviceId)
          .eq('type', 'servicio')
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      if (serviceRes.error) {
        setError(serviceRes.error.message);
        setLoading(false);
        return;
      }

      setService(serviceRes.data);
      setMovements((movementsRes.data ?? []) as unknown as MovementWithDetails[]);
      setLoading(false);
    }

    fetchData();
  }, [serviceId]);

  if (loading) {
    return (
      <div className="page">
        <div className="loading">Cargando...</div>
      </div>
    );
  }

  if (error || !service) {
    return (
      <div className="page">
        <div className="error-state">
          <p>{error ?? 'Servicio no encontrado'}</p>
          <Link href="/services" className="back-btn">← Volver</Link>
        </div>
      </div>
    );
  }

  const totalRevenue = movements.reduce((sum, m) => sum + (m.amount_charged ?? 0), 0);

  return (
    <div className="page">
      <header className="page-header flex-header">
        <Link href="/services" className="back-btn">←</Link>
        <h1 className="page-title">{service.name}</h1>
        <button
          className="edit-btn"
          onClick={() => router.push(`/services/${serviceId}/edit`)}
        >
          Editar
        </button>
      </header>

      <section className="section">
        <div className="service-price-card">
          <span className="price-label">Precio</span>
          <span className="price-value">{formatGuaranies(service.price)}</span>
        </div>
      </section>

      <section className="section">
        <div className="stats-row">
          <div className="stat">
            <span className="stat-value">{movements.length}</span>
            <span className="stat-label">Ventas</span>
          </div>
          <div className="stat">
            <span className="stat-value">{formatGuaranies(totalRevenue)}</span>
            <span className="stat-label">Ingresos</span>
          </div>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Ventas recientes</h2>
        {movements.length === 0 ? (
          <p className="empty-text">Sin ventas registradas</p>
        ) : (
          <ul className="movement-list">
            {movements.map((m) => (
              <li key={m.id} className="movement-item">
                <div className="movement-info">
                  <span className="movement-contact">{m.contact?.full_name ?? 'Sin cliente'}</span>
                  <span className="movement-date">{formatDate(m.created_at)}</span>
                </div>
                <div className="movement-amount">
                  <span className="amount">+{formatGuaranies(m.amount_charged ?? 0)}</span>
                  <span className="payment-badge">{m.payment_method ?? '-'}</span>
                </div>
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
          align-items: center;
          gap: 12px;
        }

        .back-btn {
          width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          background: var(--gray-100);
          border-radius: 8px;
          color: var(--black);
          text-decoration: none;
        }

        .page-title {
          flex: 1;
          font-size: 24px;
          font-weight: 700;
        }

        .edit-btn {
          padding: 8px 16px;
          background: var(--black);
          color: var(--white);
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
        }

        .loading {
          text-align: center;
          padding: 48px;
          color: var(--gray-500);
        }

        .error-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          padding: 48px;
          text-align: center;
        }

        .error-state p {
          color: var(--gray-500);
        }

        .section {
          margin-bottom: 24px;
        }

        .service-price-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 32px;
          background: var(--black);
          color: var(--white);
          border-radius: 12px;
          text-align: center;
        }

        .price-label {
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--gray-400);
        }

        .price-value {
          font-size: 36px;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
        }

        .stats-row {
          display: flex;
          gap: 12px;
        }

        .stat {
          flex: 1;
          padding: 16px;
          background: var(--white);
          border: 1px solid var(--gray-200);
          border-radius: 12px;
          text-align: center;
        }

        .stat-value {
          display: block;
          font-size: 20px;
          font-weight: 700;
          color: var(--black);
          margin-bottom: 4px;
        }

        .stat-label {
          font-size: 12px;
          color: var(--gray-500);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .section-title {
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--gray-400);
          margin-bottom: 12px;
        }

        .empty-text {
          color: var(--gray-500);
          font-size: 14px;
          text-align: center;
          padding: 24px;
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
          padding: 16px;
          background: var(--white);
        }

        .movement-info {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .movement-contact {
          font-size: 14px;
          font-weight: 500;
          color: var(--black);
        }

        .movement-date {
          font-size: 12px;
          color: var(--gray-500);
        }

        .movement-amount {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 4px;
        }

        .amount {
          font-size: 15px;
          font-weight: 700;
          color: var(--black);
          font-variant-numeric: tabular-nums;
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
        }
      `}</style>
    </div>
  );
}