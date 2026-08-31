'use client';

import { formatGuaranies } from '@/lib/utils';
import type { Service } from '@/types';

interface ServiceCardProps {
  service: Service;
  qtyInCart: number;
  onAdd: (service: Service) => void;
}

export function ServiceCard({ service, qtyInCart, onAdd }: ServiceCardProps) {
  return (
    <li className="storefront-service-card">
      <div className="storefront-service-info">
        <span className="storefront-service-name">{service.name}</span>
        {service.description && (
          <span className="storefront-service-description">{service.description}</span>
        )}
        <span className="storefront-service-price">{formatGuaranies(service.price)}</span>
      </div>
      <button type="button" className="storefront-add-btn" onClick={() => onAdd(service)}>
        {qtyInCart > 0 ? `En carrito (${qtyInCart})` : 'Agregar'}
      </button>

      <style>{`
        .storefront-service-card {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          padding: 16px 20px;
          background: var(--surface);
        }
        .storefront-service-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .storefront-service-name {
          font-size: 15px;
          font-weight: 600;
          color: var(--text-primary);
        }
        .storefront-service-description {
          font-size: 13px;
          color: var(--text-secondary);
        }
        .storefront-service-price {
          font-size: 14px;
          font-weight: 500;
          color: var(--text-secondary);
          font-variant-numeric: tabular-nums;
        }
        .storefront-add-btn {
          flex-shrink: 0;
          padding: 10px 14px;
          background: var(--accent);
          color: var(--accent-foreground);
          border: none;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          min-height: 40px;
        }
      `}</style>
    </li>
  );
}
