'use client';

import { useState } from 'react';
import { formatGuaranies } from '@/lib/utils';
import { Toggle } from './Toggle';
import type { Service } from '@/types';

interface ServiceCardProps {
  service: Service;
  onToggle: (id: string, available: boolean) => void;
  onClick: (id: string) => void;
  index?: number;
}

export function ServiceCard({ service, onToggle, onClick, index = 0 }: ServiceCardProps) {
  const [available, setAvailable] = useState(service.is_available ?? true);
  const [mutating, setMutating] = useState(false);

  const isEven = index % 2 === 0;

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

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick(service.id);
  };

  return (
    <li
      className="sc-card"
      data-testid={`service-card-${service.id}`}
      data-unavailable={!available ? 'true' : undefined}
      onClick={() => onClick(service.id)}
    >
      <div className={`sc-icon-band ${isEven ? 'sc-icon-band-accent' : 'sc-icon-band-neutral'}`}>
        {/* Generic service/tag icon — the data model has no per-service
            category (no "corte"/"barba"/"combo" concept), so every tile
            uses the same neutral glyph; only the tint alternates by index
            to preserve the canvas's visual rhythm across a multi-vertical
            catalog (barbershop, gastronomy, retail, etc). */}
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.828 8.828a2 2 0 0 0 2.828 0l7.172-7.172a2 2 0 0 0 0-2.828l-8.828-8.828Z"
            stroke={isEven ? '#B5431C' : '#241B16'}
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <circle cx="7.5" cy="7.5" r="1.5" stroke={isEven ? '#B5431C' : '#241B16'} strokeWidth="1.8" />
        </svg>
      </div>

      <div className="sc-body">
        <span className="sc-name">{service.name}</span>

        <div className="sc-row">
          <span className="sc-price">{formatGuaranies(service.price)}</span>
          <button
            type="button"
            className="sc-edit"
            aria-label={`Editar ${service.name}`}
            onClick={handleEditClick}
          >
            <span className="sc-edit-visual">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M4 20h4l10.5-10.5a2.121 2.121 0 0 0-3-3L5 17v3Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </button>
        </div>

        <div className="sc-toggle-wrap" onClick={handleToggle}>
          <Toggle
            checked={available}
            onChange={handleToggleChange}
            label={`Disponibilidad de ${service.name}`}
            disabled={mutating}
          />
        </div>
      </div>

      <style>{`
        .sc-card {
          display: flex;
          flex-direction: column;
          background: var(--refresh-surface-glass, var(--surface));
          backdrop-filter: blur(16px) saturate(160%);
          -webkit-backdrop-filter: blur(16px) saturate(160%);
          border-radius: var(--refresh-radius-card, 16px);
          border: var(--refresh-border-hard, 1px solid var(--border));
          box-shadow: var(--refresh-shadow-hard-sm, none);
          cursor: pointer;
          list-style: none;
          overflow: hidden;
          transition: background 0.1s, opacity 0.15s;
          font-family: var(--refresh-font-sans, inherit);
        }
        .sc-card:active { background: var(--surface-elevated); }

        [data-unavailable="true"] {
          opacity: 0.55;
        }
        [data-unavailable="true"] .sc-name {
          text-decoration: line-through;
        }

        .sc-icon-band {
          height: 84px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          border-bottom: var(--refresh-border-hard, 1px solid var(--border));
        }
        .sc-icon-band-accent {
          background: var(--refresh-accent-tint, rgba(232, 93, 44, 0.16));
        }
        .sc-icon-band-neutral {
          background: var(--refresh-neutral-tint, rgba(36, 27, 22, 0.08));
        }

        .sc-body {
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .sc-name {
          font-size: 13px;
          font-weight: 700;
          line-height: 1.25;
          min-height: 33px;
          color: var(--refresh-ink, var(--text-primary));
          transition: opacity 0.15s, color 0.15s;
        }

        .sc-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        .sc-price {
          flex: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-family: var(--refresh-font-display, inherit);
          font-size: 14px;
          color: var(--refresh-ink, var(--text-primary));
          font-variant-numeric: tabular-nums;
          transition: opacity 0.15s;
        }

        .sc-edit {
          flex-shrink: 0;
          width: 44px;
          height: 44px;
          min-width: 44px;
          min-height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          padding: 0;
          margin: 0;
          cursor: pointer;
          color: var(--refresh-ink, var(--text-primary));
        }
        .sc-edit-visual {
          width: 30px;
          height: 30px;
          border-radius: 8px;
          border: var(--refresh-border-hard, 1px solid var(--border));
          background: rgba(255, 255, 255, 0.75);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .sc-toggle-wrap {
          display: flex;
          align-items: center;
          padding: 10px 0;
        }
      `}</style>
    </li>
  );
}
