'use client';

import { useState, useEffect } from 'react';
import { useBranch } from '@/contexts/BranchContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useToast } from '@/contexts/ToastContext';
import { getCurrentUserId } from '@/lib/auth';
import { getLastClosing, getCalculatedBalanceSince, getPendingOrdersCount } from '@/lib/closings';
import { buildClosingPayload } from '@/lib/arqueo';
import { insertCashClosing } from '@/lib/data/closings';
import { formatGuaranies, parseGuaranies, formatDate } from '@/lib/utils';
import { HoldButton } from './HoldButton';
import { GuaraniesInput } from './GuaraniesInput';
import type { ArqueoAmounts } from '@/types';

const FALLBACK_PERIOD_START = '2000-01-01T00:00:00.000Z';

type Step = 1 | 2 | 3;

interface ClosingWizardProps {
  onClose: () => void;
  onSaved: () => void;
}

export function ClosingWizard({ onClose, onSaved }: ClosingWizardProps) {
  const { currentBranch } = useBranch();
  const { settings } = useSettings();
  const { showToast } = useToast();

  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(true);
  const [periodStart, setPeriodStart] = useState<string>(FALLBACK_PERIOD_START);
  const [calculated, setCalculated] = useState<ArqueoAmounts | null>(null);
  const [pendingOrdersCount, setPendingOrdersCount] = useState<number | null>(0);
  const [submitting, setSubmitting] = useState(false);

  const [countedEfectivo, setCountedEfectivo] = useState('');
  const [countedTransferencia, setCountedTransferencia] = useState('');
  const [countedPos, setCountedPos] = useState('');
  const [notes, setNotes] = useState('');

  const arqueoEnabled = settings.mandatory_arqueo_enabled;

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!currentBranch) { setLoading(false); return; }
      setLoading(true);
      const lastClosing = await getLastClosing(currentBranch.id);
      const start = lastClosing?.closed_at || FALLBACK_PERIOD_START;
      const [balance, pendingCount] = await Promise.all([
        getCalculatedBalanceSince(currentBranch.id, start),
        getPendingOrdersCount(currentBranch.id),
      ]);
      if (cancelled) return;
      setPeriodStart(start);
      setCalculated(balance);
      setPendingOrdersCount(pendingCount);
      setLoading(false);
    };

    load();
    return () => { cancelled = true; };
  }, [currentBranch]);

  const handleConfirm = async () => {
    if (!currentBranch || !calculated) return;
    setSubmitting(true);

    const userId = await getCurrentUserId();
    if (!userId) {
      showToast('Debes estar logueado para cerrar caja', 'error');
      setSubmitting(false);
      return;
    }

    const counted: ArqueoAmounts = {
      efectivo: parseGuaranies(countedEfectivo),
      transferencia: parseGuaranies(countedTransferencia),
      pos: parseGuaranies(countedPos),
    };

    const payload = buildClosingPayload({
      calculated,
      counted: arqueoEnabled ? counted : null,
      arqueoEnabled,
      branchId: currentBranch.id,
      closedBy: userId,
      periodStart,
      notes: notes.trim() === '' ? null : notes.trim(),
    });

    const { error } = await insertCashClosing(payload);

    if (error) {
      showToast('Error al cerrar caja', 'error');
      setSubmitting(false);
      return;
    }

    showToast('Caja cerrada', 'success');
    setSubmitting(false);
    onSaved();
    onClose();
  };

  if (loading || !calculated) {
    return <p className="wz-loading">Cargando período...</p>;
  }

  if (!currentBranch) {
    return <p className="wz-loading">Seleccioná una sucursal</p>;
  }

  const total = calculated.efectivo + calculated.transferencia + calculated.pos;

  const hasAllCounts = arqueoEnabled
    ? countedEfectivo !== '' && countedTransferencia !== '' && countedPos !== ''
    : true;

  const counted: ArqueoAmounts = {
    efectivo: parseGuaranies(countedEfectivo),
    transferencia: parseGuaranies(countedTransferencia),
    pos: parseGuaranies(countedPos),
  };

  const formatSigned = (value: number) => {
    const sign = value > 0 ? '+' : value < 0 ? '−' : '';
    return `${sign}${formatGuaranies(Math.abs(value))}`;
  };

  const discrepancyClass = (countedValue: number, calculatedValue: number) => {
    if (countedValue > calculatedValue) return 'wz-surplus';
    if (countedValue < calculatedValue) return 'wz-shortage';
    return '';
  };

  return (
    <div className="wz-root">
      {/* Step indicators */}
      <div className="wz-steps">
        {([1, 2, 3] as Step[]).map((s) => (
          <div key={s} className={`wz-dot${step === s ? ' wz-dot-active' : step > s ? ' wz-dot-done' : ''}`} />
        ))}
      </div>

      {/* Step 1: Resumen */}
      {step === 1 && (
        <div data-testid="wizard-step-1">
          <p className="wz-period">
            {periodStart === FALLBACK_PERIOD_START
              ? 'Período: desde el inicio'
              : `Desde ${formatDate(periodStart)}`} hasta ahora
          </p>

          {pendingOrdersCount === null && (
            <p className="wz-pending-warning">
              ⚠ No se pudo verificar si hay pedidos pendientes. Revisá la lista de pedidos antes de cerrar caja.
            </p>
          )}
          {typeof pendingOrdersCount === 'number' && pendingOrdersCount > 0 && (
            <p className="wz-pending-warning">
              ⚠ Hay {pendingOrdersCount} pedido{pendingOrdersCount === 1 ? '' : 's'} pendiente{pendingOrdersCount === 1 ? '' : 's'} sin completar. Sus movimientos no están incluidos en este cierre y quedarán en el próximo período.
            </p>
          )}

          <h3 className="wz-section-title">Balance calculado</h3>
          <div className="wz-balance">
            <div className="wz-balance-row">
              <span>Efectivo</span>
              <span>{formatGuaranies(calculated.efectivo)}</span>
            </div>
            <div className="wz-balance-row">
              <span>Transferencia</span>
              <span>{formatGuaranies(calculated.transferencia)}</span>
            </div>
            <div className="wz-balance-row">
              <span>POS</span>
              <span>{formatGuaranies(calculated.pos)}</span>
            </div>
            <div className="wz-balance-row wz-total">
              <span>Total</span>
              <span>{formatGuaranies(total)}</span>
            </div>
          </div>

          <button className="wz-btn-primary" onClick={() => setStep(2)}>
            Siguiente
          </button>
        </div>
      )}

      {/* Step 2: Conteo físico */}
      {step === 2 && (
        <div data-testid="wizard-step-2">
          {arqueoEnabled ? (
            <>
              <h3 className="wz-section-title">Conteo físico</h3>

              <div className="wz-field">
                <label htmlFor="wz-efectivo">Efectivo contado</label>
                <GuaraniesInput
                  id="wz-efectivo"
                  placeholder="0"
                  className="wz-input"
                  value={countedEfectivo}
                  onChange={setCountedEfectivo}
                />
                {countedEfectivo !== '' && (
                  <span className="wz-disc">{formatSigned(counted.efectivo - calculated.efectivo)}</span>
                )}
              </div>

              <div className="wz-field">
                <label htmlFor="wz-transferencia">Transferencia contada</label>
                <GuaraniesInput
                  id="wz-transferencia"
                  placeholder="0"
                  className="wz-input"
                  value={countedTransferencia}
                  onChange={setCountedTransferencia}
                />
                {countedTransferencia !== '' && (
                  <span className="wz-disc">{formatSigned(counted.transferencia - calculated.transferencia)}</span>
                )}
              </div>

              <div className="wz-field">
                <label htmlFor="wz-pos">POS contado</label>
                <GuaraniesInput
                  id="wz-pos"
                  placeholder="0"
                  className="wz-input"
                  value={countedPos}
                  onChange={setCountedPos}
                />
                {countedPos !== '' && (
                  <span className="wz-disc">{formatSigned(counted.pos - calculated.pos)}</span>
                )}
              </div>
            </>
          ) : (
            <div className="wz-no-arqueo">
              <p>El arqueo físico no es obligatorio en esta sucursal.</p>
              <p className="wz-no-arqueo-sub">Podés confirmar el cierre directamente.</p>
            </div>
          )}

          <div className="wz-nav">
            <button className="wz-btn-back" onClick={() => setStep(1)}>← Volver</button>
            <button
              className="wz-btn-primary"
              onClick={() => setStep(3)}
              disabled={!hasAllCounts}
            >
              Confirmar
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Hold to confirm */}
      {step === 3 && (
        <div data-testid="wizard-step-3">
          <h3 className="wz-section-title">Confirmá el cierre</h3>
          <p className="wz-confirm-info">
            Estás a punto de cerrar la caja de <strong>{currentBranch.name}</strong>.
            Esta acción no se puede deshacer.
          </p>

          {arqueoEnabled && hasAllCounts && (
            <div className="wz-balance">
              <div className="wz-balance-row">
                <span>Efectivo</span>
                <span className={discrepancyClass(counted.efectivo, calculated.efectivo)}>
                  {formatSigned(counted.efectivo - calculated.efectivo)}
                </span>
              </div>
              <div className="wz-balance-row">
                <span>Transferencia</span>
                <span className={discrepancyClass(counted.transferencia, calculated.transferencia)}>
                  {formatSigned(counted.transferencia - calculated.transferencia)}
                </span>
              </div>
              <div className="wz-balance-row">
                <span>POS</span>
                <span className={discrepancyClass(counted.pos, calculated.pos)}>
                  {formatSigned(counted.pos - calculated.pos)}
                </span>
              </div>
            </div>
          )}

          <div className="wz-field">
            <label htmlFor="wz-notes">Notas (opcional)</label>
            <textarea
              id="wz-notes"
              className="wz-textarea"
              placeholder="Ej: diferencia por vuelto mal entregado"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="wz-nav">
            <button className="wz-btn-back" onClick={() => setStep(2)}>← Volver</button>
          </div>

          <HoldButton
            label="Mantené para cerrar caja"
            holdLabel="Cerrando..."
            onConfirm={handleConfirm}
            disabled={submitting}
          />
        </div>
      )}

      <style>{`
        .wz-root { display: flex; flex-direction: column; gap: 20px; }

        .wz-steps {
          display: flex; justify-content: center; gap: 8px; padding-bottom: 4px;
        }
        .wz-dot {
          width: 8px; height: 8px; border-radius: 50%;
          background: var(--border);
          transition: background 0.2s, transform 0.2s;
        }
        .wz-dot-active { background: var(--accent); transform: scale(1.3); }
        .wz-dot-done { background: var(--accent); opacity: 0.4; }

        .wz-loading { color: var(--text-secondary); font-size: 14px; }
        .wz-period { font-size: 13px; color: var(--text-secondary); }
        .wz-pending-warning {
          font-size: 13px; color: #92400e; background: rgba(217,119,6,.12);
          border: 1px solid rgba(217,119,6,.28); border-radius: 8px;
          padding: 10px 12px; margin: 12px 0;
        }
        .wz-section-title {
          font-size: 12px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.06em; color: var(--text-muted); margin-bottom: 10px;
        }

        .wz-balance {
          display: flex; flex-direction: column; gap: 8px;
          padding: 14px; background: var(--surface-elevated);
          border-radius: 12px; margin-bottom: 16px;
        }
        .wz-balance-row {
          display: flex; justify-content: space-between;
          font-size: 14px; color: var(--text-secondary);
        }
        .wz-total {
          font-size: 15px; font-weight: 700; color: var(--text-primary);
          border-top: 1px solid var(--border); padding-top: 8px; margin-top: 4px;
        }
        .wz-surplus { color: #16a34a; }
        .wz-shortage { color: #dc2626; }

        .wz-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
        .wz-field label { font-size: 14px; font-weight: 600; color: var(--text-primary); }
        .wz-input {
          padding: 12px 14px; font-size: 16px;
          border: 1px solid var(--border); border-radius: 8px;
          background: var(--surface); color: var(--text-primary);
        }
        .wz-input:focus { outline: 2px solid var(--accent); border-color: var(--accent); }
        .wz-textarea {
          padding: 12px 14px; font-size: 15px; min-height: 72px; resize: vertical;
          border: 1px solid var(--border); border-radius: 8px;
          background: var(--surface); color: var(--text-primary); font-family: inherit;
        }
        .wz-textarea:focus { outline: 2px solid var(--accent); border-color: var(--accent); }
        .wz-disc { font-size: 13px; font-weight: 600; color: var(--text-secondary); }

        .wz-no-arqueo {
          text-align: center; padding: 24px 0;
          color: var(--text-secondary); font-size: 15px;
        }
        .wz-no-arqueo-sub { font-size: 13px; margin-top: 6px; opacity: 0.7; }

        .wz-confirm-info { font-size: 14px; color: var(--text-secondary); margin-bottom: 16px; }

        .wz-nav { display: flex; justify-content: flex-start; margin-bottom: 16px; }

        .wz-btn-primary {
          width: 100%; padding: 14px; border: none; border-radius: 12px;
          background: var(--accent); color: var(--accent-foreground);
          font-size: 15px; font-weight: 700; cursor: pointer;
        }
        .wz-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

        .wz-btn-back {
          padding: 8px 12px; min-height: 44px;
          display: inline-flex; align-items: center; justify-content: center;
          border: 1px solid var(--border); border-radius: 8px;
          background: transparent; color: var(--text-secondary);
          font-size: 14px; font-weight: 600; cursor: pointer;
        }
      `}</style>
    </div>
  );
}
