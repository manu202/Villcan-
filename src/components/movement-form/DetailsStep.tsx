'use client';

import type { MovementType } from '@/types';
import { GuaraniesInput } from '../GuaraniesInput';
import { ConfirmModal } from '../ConfirmModal';
import { parseGuaranies } from '@/lib/utils';
import { fuentes } from './shared';

interface DetailsStepProps {
  onBack: () => void;
  type: MovementType | '';
  comment: string;
  onCommentChange: (value: string) => void;
  income: string;
  onIncomeChange: (value: string) => void;
  attempted: boolean;
  fuente: typeof fuentes[number] | '';
  onFuenteChange: (fuente: typeof fuentes[number]) => void;
  onSubmit: (e: React.FormEvent) => void;
  isSubmitting: boolean;
  showDiscardConfirm: boolean;
  onConfirmDiscard: () => void;
  onCancelDiscard: () => void;
}

const MOVEMENT_TITLES: Record<MovementType, string> = {
  servicio: 'Nueva Venta',
  gasto: 'Nuevo Gasto',
  apertura: 'Apertura de Caja',
  cierre: 'Retiro de Caja',
};

const SUBMIT_LABELS: Record<MovementType, string> = {
  servicio: 'Registrar venta',
  gasto: 'Registrar gasto',
  apertura: 'Abrir caja',
  cierre: 'Registrar retiro',
};

export function DetailsStep({
  onBack,
  type,
  comment,
  onCommentChange,
  income,
  onIncomeChange,
  attempted,
  fuente,
  onFuenteChange,
  onSubmit,
  isSubmitting,
  showDiscardConfirm,
  onConfirmDiscard,
  onCancelDiscard,
}: DetailsStepProps) {
  return (
    <div className="page">
      <header className="page-header flex-header">
        <button onClick={onBack} className="back-btn">←</button>
        <h1 className="page-title">{type ? MOVEMENT_TITLES[type] : 'Nuevo Movimiento'}</h1>
      </header>

      <form onSubmit={onSubmit}>
        {/* SERVICIO — ya no llega aquí, se maneja en 'catalog'+'payment' */}

        {/* GASTO */}
        {type === 'gasto' && (
          <>
            <section className="section">
              <h2 className="section-title">Descripción</h2>
              <input
                type="text"
                placeholder="Descripción del gasto"
                value={comment}
                onChange={(e) => onCommentChange(e.target.value)}
                className="input"
              />
            </section>

            <section className="section">
              <h2 className="section-title">Monto</h2>
              {attempted && parseGuaranies(income) <= 0 && (
                <p className="field-error">Ingresá el monto</p>
              )}
              <GuaraniesInput
                value={income}
                onChange={onIncomeChange}
                className="input input-lg"
              />
            </section>

            <section className="section">
              <h2 className="section-title">Origen <span className="required-mark">*</span></h2>
              {attempted && !fuente && (
                <p className="field-error">Seleccioná el origen del gasto</p>
              )}
              <div className="method-grid">
                {fuentes.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => onFuenteChange(f)}
                    className={`method-btn ${fuente === f ? 'selected' : ''}`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </section>
          </>
        )}

        {/* APERTURA / CIERRE */}
        {(type === 'apertura' || type === 'cierre') && (
          <section className="section">
            <h2 className="section-title">Monto</h2>
            {attempted && parseGuaranies(income) <= 0 && (
              <p className="field-error">Ingresá el monto</p>
            )}
            <GuaraniesInput
              value={income}
              onChange={onIncomeChange}
              className="input input-lg"
            />
            <p className="input-hint">
              {type === 'apertura' ? 'Capital inicial para el turno' : 'Dinero a extraer/depositar'}
            </p>
          </section>
        )}

        <section className="section">
          <button
            type="submit"
            disabled={isSubmitting}
            className="btn-primary btn-full"
          >
            {isSubmitting ? 'Guardando...' : (type ? SUBMIT_LABELS[type] : 'Registrar')}
          </button>
        </section>
      </form>

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

        .required-mark {
          color: var(--accent);
          font-size: 14px;
        }

        .input {
          width: 100%;
        }

        .input-lg {
          font-size: 24px;
          font-weight: 700;
          text-align: center;
          padding: 16px;
        }

        .input-hint {
          font-size: 12px;
          color: var(--text-secondary);
          margin-top: 8px;
        }

        .selected-contact {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 16px;
          background: var(--surface-elevated);
          border: 1px solid var(--border);
          border-radius: 8px;
        }

        .contact-name {
          font-size: 15px;
          font-weight: 500;
        }

        .clear-btn {
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          color: var(--text-muted);
        }

        .search-status {
          font-size: 13px;
          color: var(--text-secondary);
          padding: 10px 4px;
        }

        .link-btn {
          display: block;
          width: 100%;
          padding: 12px 0;
          text-align: left;
          font-size: 14px;
          color: var(--text-secondary);
          text-decoration: underline;
          margin-top: 8px;
        }

        .service-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }

        .service-btn {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 16px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 8px;
          text-align: left;
          cursor: pointer;
          transition: all 0.15s ease;
          box-shadow: var(--shadow-sm);
        }

        .service-btn:hover {
          border-color: var(--accent-hover);
        }

        .service-btn:active {
          background: var(--accent-subtle);
          border-color: var(--accent);
        }

        .service-btn:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
        }

        .service-btn.selected {
          border-color: var(--accent);
          background: var(--accent-subtle);
        }

        .service-icon {
          color: var(--text-secondary);
        }

        .service-name {
          font-size: 14px;
          font-weight: 500;
          color: var(--text-primary);
        }

        .service-price {
          font-size: 12px;
          color: var(--text-secondary);
        }

        .method-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
        }

        .method-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          padding: 16px 12px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .method-btn:hover {
          border-color: var(--accent-hover);
        }

        .method-btn:active {
          background: var(--accent-subtle);
          border-color: var(--accent);
        }

        .method-btn:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
        }

        .method-btn.selected {
          border-color: var(--accent);
          background: var(--accent);
          color: var(--accent-foreground);
        }

        .method-icon {
          color: inherit;
        }

        .btn-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .field-error {
          font-size: 12px;
          color: #ef4444;
          margin-bottom: 8px;
          font-weight: 500;
        }

        .dropdown {
          list-style: none;
          border: 1px solid var(--border);
          border-radius: 8px;
          margin-top: 8px;
          overflow: hidden;
        }

        .dropdown-item {
          display: block;
          width: 100%;
          padding: 12px 16px;
          text-align: left;
          font-size: 14px;
          background: var(--surface-elevated);
          cursor: pointer;
        }

        .dropdown-item:hover {
          background: var(--accent-subtle);
        }
      `}</style>

      {showDiscardConfirm && (
        <ConfirmModal
          message="¿Descartar los datos ingresados?"
          onConfirm={onConfirmDiscard}
          onCancel={onCancelDiscard}
        />
      )}
    </div>
  );
}
