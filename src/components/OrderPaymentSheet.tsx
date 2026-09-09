'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatGuaranies } from '@/lib/utils';
import { AppSheet } from './AppSheet';
import type { Order, OrderItem } from '@/types';

interface OrderPaymentSheetProps {
  order: Order;
  items: OrderItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted: () => void;
}

export function OrderPaymentSheet({ order, items, open, onOpenChange, onCompleted }: OrderPaymentSheetProps) {
  const [montoRecibido, setMontoRecibido] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isDelivery = order.delivery_type === 'delivery';
  const isEfectivo = order.payment_method === 'efectivo';
  const deliveryFee = isDelivery ? (order.delivery_fee ?? 0) : 0;
  const finalTotal = order.total + deliveryFee;
  const monto = parseInt(montoRecibido, 10) || 0;
  const vuelto = isEfectivo ? Math.max(0, monto - finalTotal) : 0;
  const canConfirm = isEfectivo ? monto >= finalTotal : true;

  const handleConfirm = async () => {
    if (!canConfirm || submitting) return;
    setSubmitting(true);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    await supabase.from('movements').insert({
      type: 'servicio',
      amount_charged: finalTotal,
      income: finalTotal,
      expense: isEfectivo ? monto - finalTotal : 0,
      payment_method: order.payment_method,
      contact_id: order.contact_id,
      user_id: user?.id,
      branch_id: order.branch_id,
      comment: `Pedido ${order.order_code}`,
      order_id: order.id,
    });

    await supabase.from('orders').update({ status: 'completed' }).eq('id', order.id);

    setSubmitting(false);
    onCompleted();
  };

  return (
    <AppSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Confirmar pago"
      footer={
        <button
          type="button"
          className="ops-confirm-btn"
          onClick={handleConfirm}
          disabled={!canConfirm || submitting}
        >
          {submitting ? 'Procesando...' : 'Confirmar cobro'}
        </button>
      }
    >
      <div className="ops-body">
        <div className="ops-summary-card">
          <span className="ops-summary-label">
            {isDelivery && deliveryFee > 0 ? 'Total (c/delivery)' : 'Total del pedido'}
          </span>
          <span className="ops-total" data-testid="ops-total">{formatGuaranies(finalTotal)}</span>
        </div>

        <div className="ops-items-count">
          {items.length} {items.length === 1 ? 'ítem' : 'ítems'}
        </div>

        {isDelivery && deliveryFee > 0 && (
          <div className="ops-delivery-section">
            <div className="ops-fee-breakdown">
              <span>Productos</span>
              <span>{formatGuaranies(order.total)}</span>
            </div>
            <div className="ops-fee-breakdown">
              <span>Delivery</span>
              <span>{formatGuaranies(deliveryFee)}</span>
            </div>
          </div>
        )}

        {isEfectivo ? (
          <div className="ops-cash-section">
            <label className="ops-field-label" htmlFor="ops-monto">
              Monto recibido
            </label>
            <input
              id="ops-monto"
              type="number"
              placeholder="Monto recibido"
              value={montoRecibido}
              onChange={(e) => setMontoRecibido(e.target.value)}
              className="ops-input"
              inputMode="numeric"
              min={0}
            />
            {monto > 0 && (
              <div className="ops-vuelto-row">
                <span className="ops-vuelto-label">Vuelto</span>
                <span className="ops-vuelto-amount" data-testid="ops-vuelto">
                  {formatGuaranies(vuelto)}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="ops-transfer-info">
            <p className="ops-transfer-text">
              Confirmá que el pago por {order.payment_method === 'transferencia' ? 'transferencia' : 'POS'} fue recibido.
            </p>
          </div>
        )}
      </div>

      <style>{`
        .ops-body {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .ops-summary-card {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px;
          background: var(--surface-elevated);
          border-radius: 12px;
          border: 1px solid var(--border);
        }

        .ops-summary-label {
          font-size: 14px;
          color: var(--text-secondary);
          font-weight: 500;
        }

        .ops-total {
          font-size: 20px;
          font-weight: 800;
          color: var(--text-primary);
          font-variant-numeric: tabular-nums;
        }

        .ops-items-count {
          font-size: 13px;
          color: var(--text-secondary);
          text-align: center;
        }

        .ops-delivery-section {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .ops-fee-breakdown {
          display: flex;
          justify-content: space-between;
          font-size: 13px;
          color: var(--text-secondary);
          padding: 8px 2px 0;
        }

        .ops-cash-section {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .ops-field-label {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-secondary);
        }

        .ops-input {
          padding: 14px;
          font-size: 18px;
          font-weight: 600;
          border: 1px solid var(--border);
          border-radius: 10px;
          background: var(--surface-elevated);
          color: var(--text-primary);
          font-variant-numeric: tabular-nums;
          width: 100%;
          box-sizing: border-box;
        }

        .ops-vuelto-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 14px;
          background: var(--surface-elevated);
          border-radius: 10px;
          border: 1px solid var(--border);
        }

        .ops-vuelto-label {
          font-size: 14px;
          color: var(--text-secondary);
        }

        .ops-vuelto-amount {
          font-size: 16px;
          font-weight: 700;
          color: var(--text-primary);
          font-variant-numeric: tabular-nums;
        }

        .ops-transfer-info {
          padding: 16px;
          background: var(--surface-elevated);
          border-radius: 10px;
          border: 1px solid var(--border);
        }

        .ops-transfer-text {
          margin: 0;
          font-size: 14px;
          color: var(--text-secondary);
          line-height: 1.5;
        }

        .ops-confirm-btn {
          width: 100%;
          padding: 16px;
          background: var(--accent);
          color: var(--accent-foreground);
          border: none;
          border-radius: 10px;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          min-height: 52px;
        }

        .ops-confirm-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
      `}</style>
    </AppSheet>
  );
}
