'use client';

import { ShoppingCart, Receipt, Unlock, Lock, type LucideIcon } from 'lucide-react';
import type { MovementType } from '@/types';

interface TypeStepProps {
  onBack: () => void;
  onSelectType: (type: MovementType) => void;
}

const movementTypes: { value: MovementType; label: string; description: string; icon: LucideIcon }[] = [
  { value: 'servicio', label: 'Venta', description: 'Cobro de servicio o producto', icon: ShoppingCart },
  { value: 'gasto', label: 'Gasto', description: 'Egreso de dinero', icon: Receipt },
  { value: 'apertura', label: 'Apertura', description: 'Capital inicial del turno', icon: Unlock },
  { value: 'cierre', label: 'Retiro', description: 'Extracción de caja', icon: Lock },
];

export function TypeStep({ onBack, onSelectType }: TypeStepProps) {
  return (
    <div className="page">
      <header className="page-header flex-header">
        <button onClick={onBack} className="back-btn">←</button>
        <h1 className="page-title">Nuevo Movimiento</h1>
      </header>

      <section className="section">
        <h2 className="section-title">Seleccionar tipo</h2>
        <div className="type-grid">
          {movementTypes.map((t) => (
            <button
              key={t.value}
              onClick={() => onSelectType(t.value)}
              className="type-card"
            >
              <t.icon size={20} className="type-icon" aria-hidden="true" />
              <span className="type-label">{t.label}</span>
              <span className="type-desc">{t.description}</span>
            </button>
          ))}
        </div>
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
          background: var(--surface-elevated);
          border-radius: 8px;
          color: var(--text-primary);
        }

        .page-title {
          font-size: 24px;
          font-weight: 700;
        }

        .section {
          margin-bottom: 24px;
        }

        .section-title {
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted);
          margin-bottom: 12px;
        }

        .type-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .type-card {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 20px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          text-align: left;
          cursor: pointer;
          transition: all 0.15s ease;
          box-shadow: var(--shadow-sm);
        }

        .type-card:hover {
          border-color: var(--accent-hover);
        }

        .type-card:active {
          background: var(--accent-subtle);
          border-color: var(--accent-hover);
        }

        .type-card:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
        }

        .type-icon {
          color: var(--text-secondary);
        }

        .type-label {
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .type-desc {
          font-size: 12px;
          color: var(--text-secondary);
        }
      `}</style>
    </div>
  );
}
