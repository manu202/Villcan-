'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useBranch } from '@/contexts/BranchContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useToast } from '@/contexts/ToastContext';
import { getCurrentUserId } from '@/lib/auth';
import { getLastClosing, getCalculatedBalanceSince } from '@/lib/closings';
import { buildClosingPayload } from '@/lib/arqueo';
import { createClient } from '@/lib/supabase/client';
import { formatGuaranies, parseGuaranies } from '@/lib/utils';
import type { ArqueoAmounts } from '@/types';

const FALLBACK_PERIOD_START = '2000-01-01T00:00:00.000Z';

export function ClosingForm() {
  const router = useRouter();
  const { currentBranch } = useBranch();
  const { settings } = useSettings();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [periodStart, setPeriodStart] = useState<string>(FALLBACK_PERIOD_START);
  const [calculated, setCalculated] = useState<ArqueoAmounts | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [countedEfectivo, setCountedEfectivo] = useState('');
  const [countedTransferencia, setCountedTransferencia] = useState('');
  const [countedPos, setCountedPos] = useState('');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!currentBranch) {
        setLoading(false);
        return;
      }
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

    return () => {
      cancelled = true;
    };
  }, [currentBranch]);

  if (loading || !calculated) {
    return (
      <div className="page">
        <p className="page-subtitle">Cargando...</p>
      </div>
    );
  }

  if (!currentBranch) {
    return (
      <div className="page">
        <p className="page-subtitle">Selecciona una sucursal</p>
      </div>
    );
  }

  const arqueoEnabled = settings.mandatory_arqueo_enabled;

  const counted: ArqueoAmounts = {
    efectivo: parseGuaranies(countedEfectivo),
    transferencia: parseGuaranies(countedTransferencia),
    pos: parseGuaranies(countedPos),
  };

  const hasAllCounts = countedEfectivo !== '' && countedTransferencia !== '' && countedPos !== '';

  const discrepancy: ArqueoAmounts = {
    efectivo: counted.efectivo - calculated.efectivo,
    transferencia: counted.transferencia - calculated.transferencia,
    pos: counted.pos - calculated.pos,
  };

  const formatSigned = (value: number): string => {
    const sign = value > 0 ? '+' : value < 0 ? '-' : '';
    return `${sign}${formatGuaranies(Math.abs(value))}`;
  };

  const handleClose = async () => {
    setSubmitting(true);

    const userId = await getCurrentUserId();
    if (!userId) {
      showToast('Debes estar logueado para cerrar caja', 'error');
      setSubmitting(false);
      return;
    }

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
    router.push('/closings');
  };

  const canSubmit = !submitting && (!arqueoEnabled || hasAllCounts);

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-title">Cerrar Caja</h1>
        <p className="page-subtitle">{currentBranch.name}</p>
      </header>

      <section className="section">
        <h2 className="section-title">Balance calculado</h2>
        <div className="balance-grid">
          <div className="balance-row">
            <span>Efectivo</span>
            <span>{formatGuaranies(calculated.efectivo)}</span>
          </div>
          <div className="balance-row">
            <span>Transferencia</span>
            <span>{formatGuaranies(calculated.transferencia)}</span>
          </div>
          <div className="balance-row">
            <span>POS</span>
            <span>{formatGuaranies(calculated.pos)}</span>
          </div>
          <div className="balance-row balance-total">
            <span>Total</span>
            <span>{formatGuaranies(calculated.efectivo + calculated.transferencia + calculated.pos)}</span>
          </div>
        </div>
      </section>

      {arqueoEnabled && (
        <section className="section">
          <h2 className="section-title">Conteo físico</h2>

          <div className="count-field">
            <label htmlFor="counted_efectivo">Efectivo contado</label>
            <input
              id="counted_efectivo"
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={countedEfectivo}
              onChange={(e) => setCountedEfectivo(e.target.value)}
              className="input"
            />
            {countedEfectivo !== '' && (
              <span className="discrepancy">{formatSigned(discrepancy.efectivo)}</span>
            )}
          </div>

          <div className="count-field">
            <label htmlFor="counted_transferencia">Transferencia contada</label>
            <input
              id="counted_transferencia"
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={countedTransferencia}
              onChange={(e) => setCountedTransferencia(e.target.value)}
              className="input"
            />
            {countedTransferencia !== '' && (
              <span className="discrepancy">{formatSigned(discrepancy.transferencia)}</span>
            )}
          </div>

          <div className="count-field">
            <label htmlFor="counted_pos">POS contado</label>
            <input
              id="counted_pos"
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={countedPos}
              onChange={(e) => setCountedPos(e.target.value)}
              className="input"
            />
            {countedPos !== '' && (
              <span className="discrepancy">{formatSigned(discrepancy.pos)}</span>
            )}
          </div>
        </section>
      )}

      <section className="section">
        <button
          type="button"
          className="btn-primary btn-full"
          disabled={!canSubmit}
          onClick={handleClose}
        >
          {submitting ? 'Cerrando...' : 'Cerrar Caja'}
        </button>
      </section>

      <style>{`
        .page {
          max-width: 480px;
          margin: 0 auto;
        }

        .page-title {
          font-size: 24px;
          font-weight: 700;
        }

        .page-subtitle {
          font-size: 14px;
          color: var(--text-secondary);
          margin-top: 4px;
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

        .balance-grid {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 16px;
          background: var(--surface-elevated);
          border-radius: 12px;
        }

        .balance-row {
          display: flex;
          justify-content: space-between;
          font-size: 14px;
          color: var(--text-secondary);
        }

        .balance-total {
          font-weight: 700;
          color: var(--text-primary);
          border-top: 1px solid var(--border);
          padding-top: 8px;
          margin-top: 4px;
        }

        .count-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-bottom: 16px;
        }

        .count-field label {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .input {
          padding: 12px 16px;
          font-size: 16px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--surface);
        }

        .discrepancy {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-secondary);
        }

        .btn-primary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 14px 24px;
          background: var(--accent);
          color: var(--accent-foreground);
          border: none;
          border-radius: 8px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          min-height: 48px;
          width: 100%;
        }

        .btn-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
