'use client';

import { formatGuaranies } from '@/lib/utils';
import type { Service } from '@/types';

export interface CartLine {
  service: Service;
  qty: number;
}

interface CartSheetProps {
  lines: CartLine[];
  onIncrement: (serviceId: string) => void;
  onDecrement: (serviceId: string) => void;
  onCheckout: () => void;
}

export function CartSheet({ lines, onIncrement, onDecrement, onCheckout }: CartSheetProps) {
  const total = lines.reduce((sum, line) => sum + line.service.price * line.qty, 0);

  if (lines.length === 0) {
    return null;
  }

  return (
    <div className="cart-sheet">
      <ul className="cart-lines">
        {lines.map((line) => (
          <li key={line.service.id} className="cart-line">
            <span className="cart-line-name">{line.service.name}</span>
            <div className="cart-line-qty">
              <button type="button" aria-label={`Restar ${line.service.name}`} onClick={() => onDecrement(line.service.id)}>
                −
              </button>
              <span>{line.qty}</span>
              <button type="button" aria-label={`Sumar ${line.service.name}`} onClick={() => onIncrement(line.service.id)}>
                +
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="cart-total">
        <span>Total</span>
        <span>{formatGuaranies(total)}</span>
      </div>
      <button type="button" className="cart-checkout-btn" onClick={onCheckout}>
        Continuar pedido
      </button>

      <style>{`
        .cart-sheet {
          position: sticky;
          bottom: 0;
          background: var(--surface);
          border-top: 1px solid var(--border);
          padding: 16px 20px;
        }
        .cart-lines {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 12px;
        }
        .cart-line {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 14px;
        }
        .cart-line-qty {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .cart-line-qty button {
          width: 28px;
          height: 28px;
          border-radius: 6px;
          border: 1px solid var(--border);
          background: var(--surface-elevated);
          cursor: pointer;
        }
        .cart-total {
          display: flex;
          justify-content: space-between;
          font-weight: 700;
          font-size: 16px;
          margin-bottom: 12px;
        }
        .cart-checkout-btn {
          width: 100%;
          padding: 14px;
          background: var(--accent);
          color: var(--accent-foreground);
          border: none;
          border-radius: 8px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          min-height: 44px;
        }
      `}</style>
    </div>
  );
}
