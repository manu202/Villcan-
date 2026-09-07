'use client';

import { useState, useEffect } from 'react';
import { useBranch } from '@/contexts/BranchContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useToast } from '@/contexts/ToastContext';
import { getCurrentUserId } from '@/lib/auth';
import { getLastClosing, getCalculatedBalanceSince } from '@/lib/closings';
import { buildClosingPayload } from '@/lib/arqueo';
import { createClient } from '@/lib/supabase/client';
import { formatGuaranies, parseGuaranies, formatDate } from '@/lib/utils';
import { HoldButton } from './HoldButton';
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
  const [submitting, setSubmitting] = useState(false);

  const [countedEfectivo, setCountedEfectivo] = useState('');
  const [countedTransferencia, setCountedTransferencia] = useState('');
  const [countedPos, setCountedPos] = useState('');

  const arqueoEnabled = settings.mandatory_arqueo_enabled;

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!currentBranch) { setLoading(false); return; }
      setLoading(true);
      const lastClosing = await getLastClosing(currentBranch.id);
      const start = lastClosing?.closed_at || FALLBACK_PERIOD_START;
      const balance = await getCalculatedBalanceSince(currentBranch.id, start);
      if (cancelled) return;
      setPeriodStart(start);
      setCalculated(balance);
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
    });

    const supabase = createClient();
    const { error } = await supabase.from('cash_closings').insert(payload);

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
                <input
                  id="wz-efectivo"
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  className="wz-input"
                  value={countedEfectivo}
                  onChange={(e) => setCountedEfectivo(e.target.value)}
                />
                {countedEfectivo !== '' && (
                  <span className="wz-disc">{formatSigned(counted.efectivo - calculated.efectivo)}</span>
                )}
              </div>

              <div className="wz-field">
                <label htmlFor="wz-transferencia">Transferencia contada</label>
                <input
                  id="wz-transferencia"
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  className="wz-input"
                  value={countedTransferencia}
                  onChange={(e) => setCountedTransferencia(e.target.value)}
                />
                {countedTransferencia !== '' && (
                  <span className="wz-disc">{formatSigned(counted.transferencia - calculated.transferencia)}</span>
                )}
              </div>

              <div className="wz-field">
                <label htmlFor="wz-pos">POS contado</label>
                <input
                  id="wz-pos"
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  className="wz-input"
                  value={countedPos}
                  onChange={(e) => setCountedPos(e.target.value)}
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
                <span className={counted.efectivo !== calculated.efectivo ? 'wz-mismatch' : ''}>
                  {formatSigned(counted.efectivo - calculated.efectivo)}
                </span>
              </div>
              <div className="wz-balance-row">
                <span>Transferencia</span>
                <span className={counted.transferencia !== calculated.transferencia ? 'wz-mismatch' : ''}>
                  {formatSigned(counted.transferencia - calculated.transferencia)}
                </span>
              </div>
              <div className="wz-balance-row">
                <span>POS</span>
                <span className={counted.pos !== calculated.pos ? 'wz-mismatch' : ''}>
                  {formatSigned(counted.pos - calculated.pos)}
                </span>
              </div>
            </div>
          )}

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
        .wz-mismatch { color: #ef4444; }

        .wz-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
        .wz-field label { font-size: 14px; font-weight: 600; color: var(--text-primary); }
        .wz-input {
          padding: 12px 14px; font-size: 16px;
          border: 1px solid var(--border); border-radius: 8px;
          background: var(--surface); color: var(--text-primary);
        }
        .wz-input:focus { outline: 2px solid var(--accent); border-color: var(--accent); }
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
          padding: 8px 12px; border: 1px solid var(--border); border-radius: 8px;
          background: transparent; color: var(--text-secondary);
          font-size: 14px; font-weight: 600; cursor: pointer;
        }
      `}</style>
    </div>
  );
}
