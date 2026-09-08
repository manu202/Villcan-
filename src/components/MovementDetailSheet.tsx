'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  formatGuaranies, formatDate, formatTime,
  getMovementTypeLabel, getPaymentMethodLabel,
} from '@/lib/utils';
import type { MovementWithDetails } from '@/types';

interface MovementDetailSheetProps {
  movementId: string;
  onClose: () => void;
}

export function MovementDetailSheet({ movementId, onClose }: MovementDetailSheetProps) {
  const [movement, setMovement] = useState<MovementWithDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const load = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('movements')
        .select(`
          id, type, amount_charged, commission_pct, income, expense,
          payment_method, comment, created_at, order_id,
          contact:contacts(id, full_name),
          service:services(id, name),
          order:orders(id, order_code, order_items(id, name_snapshot, qty, unit_price, line_total)),
          movement_items(id, name_snapshot, qty, unit_price, line_total)
        `)
        .eq('id', movementId)
        .single();

      if (cancelled) return;
      setMovement(data as MovementWithDetails | null);
      setLoading(false);
    };

    load();
    return () => { cancelled = true; };
  }, [movementId]);

  if (loading) {
    return <div data-testid="mds-loading" className="mds-loading">Cargando...</div>;
  }

  if (!movement) {
    return <div className="mds-loading">Movimiento no encontrado</div>;
  }

  const net =
    movement.type === 'servicio'
      ? (movement.amount_charged ?? movement.income)
      : movement.income - movement.expense;

  return (
    <div className="mds-root">
      {/* Header row: tipo + fecha */}
      <div className="mds-header-row">
        <span className="mds-type-badge">{getMovementTypeLabel(movement.type)}</span>
        <span className="mds-date">
          {formatDate(movement.created_at)} · {formatTime(movement.created_at)}
        </span>
      </div>

      {/* Amount hero */}
      <div className={`mds-amount-hero ${net >= 0 ? 'mds-positive' : 'mds-negative'}`}>
        {net >= 0 ? '+' : '−'}{formatGuaranies(Math.abs(net))}
      </div>

      {/* ── SERVICIO ── */}
      {movement.type === 'servicio' && (
        <>
          <div className="mds-section">
            <p className="mds-section-label">Cliente</p>
            <div className="mds-info-row">
              <span className="mds-info-value">{movement.contact?.full_name ?? '—'}</span>
            </div>
          </div>

          <div className="mds-section">
            <p className="mds-section-label">
              {movement.order ? `Pedido #${movement.order.order_code}` : 'Servicio'}
            </p>
            {movement.order?.order_items?.length ? (
              <div className="mds-items-block">
                {movement.order.order_items.map((item) => (
                  <div key={item.id} className="mds-item-row">
                    <span className="mds-item-name">{item.name_snapshot}</span>
                    <span className="mds-item-qty">×{item.qty}</span>
                    <span className="mds-item-price">{formatGuaranies(item.line_total)}</span>
                  </div>
                ))}
              </div>
            ) : movement.movement_items?.length ? (
              <div className="mds-items-block">
                {movement.movement_items.map((item) => (
                  <div key={item.id} className="mds-item-row">
                    <span className="mds-item-name">{item.name_snapshot}</span>
                    <span className="mds-item-qty">×{item.qty}</span>
                    <span className="mds-item-price">{formatGuaranies(item.line_total)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mds-info-row">
                <span className="mds-info-value">{movement.service?.name ?? '—'}</span>
                <span className="mds-info-right">{formatGuaranies(movement.amount_charged ?? 0)}</span>
              </div>
            )}
          </div>

          <div className="mds-section">
            <p className="mds-section-label">Pago</p>
            <div className="mds-detail-block">
              <div className="mds-detail-row">
                <span>Método</span>
                <span>{getPaymentMethodLabel(movement.payment_method!)}</span>
              </div>
              <div className="mds-detail-row">
                <span>Monto cobrado</span>
                <span>{formatGuaranies(movement.amount_charged ?? 0)}</span>
              </div>
              {movement.payment_method === 'efectivo' && (
                <>
                  <div className="mds-detail-row">
                    <span>Recibido</span>
                    <span>{formatGuaranies(movement.income + movement.expense)}</span>
                  </div>
                  <div className="mds-detail-row">
                    <span>Vuelto</span>
                    <span>{formatGuaranies(movement.expense)}</span>
                  </div>
                </>
              )}
              <div className="mds-detail-row mds-detail-highlight">
                <span>Neto</span>
                <span>{formatGuaranies(movement.income)}</span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── GASTO ── */}
      {movement.type === 'gasto' && (
        <div className="mds-section">
          <p className="mds-section-label">Descripción</p>
          <div className="mds-info-row">
            <span className="mds-info-value">{movement.comment ?? '—'}</span>
          </div>
          <div className="mds-detail-block" style={{ marginTop: 12 }}>
            <div className="mds-detail-row mds-detail-highlight">
              <span>Monto</span>
              <span>{formatGuaranies(movement.expense)}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── APERTURA / CIERRE ── */}
      {(movement.type === 'apertura' || movement.type === 'cierre') && (
        <div className="mds-section">
          <p className="mds-section-label">
            {movement.type === 'apertura' ? 'Apertura de caja' : 'Retiro de caja'}
          </p>
          <div className="mds-detail-block">
            <div className="mds-detail-row mds-detail-highlight">
              <span>Monto</span>
              <span>
                {formatGuaranies(
                  movement.type === 'apertura' ? movement.income : movement.expense
                )}
              </span>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .mds-root { display: flex; flex-direction: column; gap: 20px; }

        .mds-loading {
          padding: 32px; text-align: center;
          font-size: 14px; color: var(--text-secondary);
        }

        .mds-header-row {
          display: flex; justify-content: space-between; align-items: center;
        }

        .mds-type-badge {
          font-size: 12px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.06em;
          background: var(--accent); color: var(--accent-foreground);
          padding: 5px 12px; border-radius: 6px;
        }

        .mds-date { font-size: 13px; color: var(--text-secondary); }

        .mds-amount-hero {
          font-size: 32px; font-weight: 800;
          font-variant-numeric: tabular-nums;
          letter-spacing: -0.02em;
          text-align: center; padding: 8px 0;
        }
        .mds-positive { color: #10b981; }
        .mds-negative { color: #f43f5e; }

        .mds-section { display: flex; flex-direction: column; gap: 8px; }

        .mds-section-label {
          font-size: 11px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.06em; color: var(--text-muted);
        }

        .mds-info-row {
          display: flex; justify-content: space-between; align-items: center;
          padding: 14px; background: var(--surface-elevated);
          border-radius: 10px;
        }

        .mds-info-value {
          font-size: 15px; font-weight: 500; color: var(--text-primary);
        }

        .mds-info-right {
          font-size: 15px; font-weight: 600;
          color: var(--text-primary); font-variant-numeric: tabular-nums;
        }

        .mds-detail-block {
          background: var(--surface-elevated); border-radius: 10px;
          padding: 4px 14px;
        }

        .mds-detail-row {
          display: flex; justify-content: space-between; align-items: center;
          padding: 11px 0; font-size: 14px; color: var(--text-secondary);
          border-bottom: 1px solid var(--border);
        }
        .mds-detail-row:last-child { border-bottom: none; }

        .mds-detail-highlight {
          font-weight: 700; color: var(--text-primary);
          font-size: 15px;
        }
        .mds-detail-highlight span:last-child {
          font-variant-numeric: tabular-nums;
        }

        .mds-items-block {
          background: var(--surface-elevated);
          border-radius: 10px;
          overflow: hidden;
        }

        .mds-item-row {
          display: flex; align-items: center; gap: 8px;
          padding: 11px 14px;
          border-bottom: 1px solid var(--border);
          font-size: 14px;
        }
        .mds-item-row:last-child { border-bottom: none; }

        .mds-item-name {
          flex: 1; font-weight: 500; color: var(--text-primary);
        }

        .mds-item-qty {
          font-size: 12px; color: var(--text-secondary);
          white-space: nowrap;
        }

        .mds-item-price {
          font-weight: 600; color: var(--text-primary);
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
        }
      `}</style>
    </div>
  );
}
