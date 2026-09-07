'use client';

import { useState } from 'react';
import { formatGuaranies } from '@/lib/utils';
import { Toggle } from './Toggle';
import type { Service } from '@/types';

interface ServiceCardProps {
  service: Service;
  onToggle: (id: string, available: boolean) => void;
  onClick: (id: string) => void;
}

export function ServiceCard({ service, onToggle, onClick }: ServiceCardProps) {
  const [available, setAvailable] = useState(service.is_available ?? true);
  const [mutating, setMutating] = useState(false);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleToggleChange = (next: boolean) => {
    if (mutating) return;
    setAvailable(next);
    setMutating(true);
    onToggle(service.id, next);
    setTimeout(() => setMutating(false), 600);
  };

  return (
    <li
      className="sc-card"
      data-testid={`service-card-${service.id}`}
      data-unavailable={!available ? 'true' : undefined}
      onClick={() => onClick(service.id)}
    >
      <div className="sc-info">
        <span className="sc-name">{service.name}</span>
        <span className="sc-price">{formatGuaranies(service.price)}</span>
      </div>

      <div className="sc-toggle-wrap" onClick={handleToggle}>
        <Toggle
          checked={available}
          onChange={handleToggleChange}
          label={`Disponibilidad de ${service.name}`}
          disabled={mutating}
        />
      </div>

      <style>{`
        .sc-card {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          background: var(--surface);
          border-radius: 12px;
          border: 1px solid var(--border);
          cursor: pointer;
          list-style: none;
          transition: background 0.1s;
        }
        .sc-card:active { background: var(--surface-elevated); }

        [data-unavailable="true"] .sc-name {
          color: var(--text-muted);
          text-decoration: line-through;
          opacity: 0.6;
        }
        [data-unavailable="true"] .sc-price {
          opacity: 0.4;
        }

        .sc-info {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .sc-name {
          font-size: 15px;
          font-weight: 600;
          color: var(--text-primary);
          transition: opacity 0.15s, color 0.15s;
        }
        .sc-price {
          font-size: 13px;
          color: var(--text-secondary);
          font-variant-numeric: tabular-nums;
          transition: opacity 0.15s;
        }

        .sc-toggle-wrap {
          flex-shrink: 0;
        }
      `}</style>
    </li>
  );
}
