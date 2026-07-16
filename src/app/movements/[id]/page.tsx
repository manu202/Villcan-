'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { formatGuaranies, formatDate, formatTime, getMovementTypeLabel, getPaymentMethodLabel } from '@/lib/utils';
import type { MovementWithDetails } from '@/types';

export default function MovementDetailPage() {
  const params = useParams();
  const movementId = params.id as string;
  const [movement, setMovement] = useState<MovementWithDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchMovement() {
      const supabase = createClient();
      const { data } = await supabase
        .from('movements')
        .select(`
          id, type, amount_charged, income, expense, payment_method, comment, created_at,
          contact:contacts(id, full_name),
          service:services(id, name)
        `)
        .eq('id', movementId)
        .single();
      setMovement(data as MovementWithDetails | null);
      setLoading(false);
    }
    fetchMovement();
  }, [movementId]);

  if (loading) {
    return (
      <div className="page">
        <header className="page-header flex-header">
          <Link href="/movements" className="back-btn">←</Link>
          <h1 className="page-title">Detalle</h1>
        </header>
        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Cargando...
        </div>
      </div>
    );
  }

  if (!movement) {
    return (
      <div className="page">
        <header className="page-header flex-header">
          <Link href="/movements" className="back-btn">←</Link>
          <h1 className="page-title">Detalle</h1>
        </header>
        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Movimiento no encontrado
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header flex-header">
        <Link href="/movements" className="back-btn">←</Link>
        <h1 className="page-title">Detalle</h1>
      </header>

      <section className="section">
        <div className="movement-header">
          <span className="type-badge">{getMovementTypeLabel(movement.type)}</span>
          <span className="movement-date">
            {formatDate(movement.created_at)} • {formatTime(movement.created_at)}
          </span>
        </div>
      </section>

      {movement.type === 'servicio' && (
        <>
          <section className="section">
            <h2 className="section-title">Cliente</h2>
            <Link href={`/contacts/${movement.contact?.id}`} className="info-card">
              <span className="info-name">{movement.contact?.full_name}</span>
              <span className="info-action">›</span>
            </Link>
          </section>

          <section className="section">
            <h2 className="section-title">Servicio</h2>
            <div className="info-card">
              <span className="info-name">{movement.service?.name}</span>
              <span className="info-price">{formatGuaranies(movement.amount_charged || 0)}</span>
            </div>
          </section>

          <section className="section">
            <h2 className="section-title">Pago</h2>
            <div className="payment-details">
              <div className="payment-row">
                <span className="payment-label">Método</span>
                <span className="payment-value">{getPaymentMethodLabel(movement.payment_method!)}</span>
              </div>
              <div className="payment-row">
                <span className="payment-label">Montocobrado</span>
                <span className="payment-value">{formatGuaranies(movement.amount_charged || 0)}</span>
              </div>
              {movement.payment_method === 'efectivo' && (
                <>
                  <div className="payment-row">
                    <span className="payment-label">Recibido</span>
                    <span className="payment-value">{formatGuaranies(movement.income)}</span>
                  </div>
                  <div className="payment-row">
                    <span className="payment-label">Vuelto</span>
                    <span className="payment-value">{formatGuaranies(movement.expense)}</span>
                  </div>
                </>
              )}
              <div className="payment-row highlight">
                <span className="payment-label">Neto</span>
                <span className="payment-value">
                  {formatGuaranies(movement.income - movement.expense)}
                </span>
              </div>
            </div>
          </section>
        </>
      )}

      {/* Gasto section */}
      {movement.type === 'gasto' && movement.comment && (
        <section className="section">
          <h2 className="section-title">Gasto</h2>
          <div className="info-card">
            <span className="info-label">Descripción</span>
            <span className="info-name">{movement.comment || '—'}</span>
          </div>
          <div className="payment-details" style={{ marginTop: '12px' }}>
            <div className="payment-row highlight">
              <span className="payment-label">Monto</span>
              <span className="payment-value">{formatGuaranies(movement.expense)}</span>
            </div>
          </div>
        </section>
      )}

      {/* Apertura / Cierre section */}
      {(movement.type === 'apertura' || movement.type === 'cierre') && (
        <section className="section">
          <h2 className="section-title">
            {movement.type === 'apertura' ? 'Apertura de caja' : 'Cierre de caja'}
          </h2>
          <div className="info-card">
            <div className="payment-row highlight">
              <span className="payment-label">Monto</span>
              <span className="payment-value">{formatGuaranies(movement.income)}</span>
            </div>
          </div>
        </section>
      )}

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
          background: var(--surface-elevated);
          border-radius: 8px;
          color: var(--text-primary);
          text-decoration: none;
        }

        .page-title {
          font-size: 24px;
          font-weight: 700;
        }

        .section {
          margin-bottom: 24px;
        }

        .movement-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .type-badge {
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          background: var(--accent);
          color: var(--accent-foreground);
          padding: 6px 12px;
          border-radius: 6px;
        }

        .movement-date {
          font-size: 12px;
          color: var(--text-secondary);
        }

        .section-title {
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted);
          margin-bottom: 12px;
        }

        .info-card {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px;
          background: var(--surface-elevated);
          border-radius: 12px;
          text-decoration: none;
          color: inherit;
        }

        .info-card:active {
          background: var(--accent-subtle);
        }

        .info-name {
          font-size: 15px;
          font-weight: 500;
          color: var(--text-primary);
        }

        .info-price {
          font-size: 15px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .info-label {
          font-size: 12px;
          color: var(--text-secondary);
          display: block;
          margin-bottom: 4px;
        }

        .info-action {
          font-size: 20px;
          color: var(--text-muted);
        }

        .payment-details {
          background: var(--surface-elevated);
          border-radius: 12px;
          padding: 16px;
        }

        .payment-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 0;
        }

        .payment-row:not(:last-child) {
          border-bottom: 1px solid var(--border);
        }

        .payment-row.highlight {
          padding-top: 12px;
        }

        .payment-row.highlight .payment-value {
          font-size: 18px;
          font-weight: 700;
        }

        .payment-label {
          font-size: 14px;
          color: var(--text-secondary);
        }

        .payment-value {
          font-size: 14px;
          font-weight: 500;
          color: var(--text-primary);
          font-variant-numeric: tabular-nums;
        }
      `}</style>
    </div>
  );
}
