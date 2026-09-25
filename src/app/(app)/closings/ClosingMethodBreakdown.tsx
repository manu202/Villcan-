import { formatGuaranies } from '@/lib/utils';

export interface ClosingMethodBreakdownData {
  arqueo_enabled: boolean;
  calculated_efectivo: number;
  calculated_transferencia: number;
  calculated_pos: number;
  counted_efectivo: number | null;
  counted_transferencia: number | null;
  counted_pos: number | null;
  discrepancy_efectivo: number | null;
  discrepancy_transferencia: number | null;
  discrepancy_pos: number | null;
}

export function formatSigned(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${formatGuaranies(Math.abs(value))}`;
}

/**
 * Per-method (efectivo/transferencia/pos) calculated/counted/discrepancy
 * breakdown, shared by the closings list rows and the closing detail page
 * so both render the exact same figures the same way.
 */
export function ClosingMethodBreakdown({ closing }: { closing: ClosingMethodBreakdownData }) {
  return (
    <>
      <div className="closing-methods">
        {(['efectivo', 'transferencia', 'pos'] as const).map((method) => {
          const calculatedKey = `calculated_${method}` as keyof ClosingMethodBreakdownData;
          const countedKey = `counted_${method}` as keyof ClosingMethodBreakdownData;
          const discrepancyKey = `discrepancy_${method}` as keyof ClosingMethodBreakdownData;
          const calculated = closing[calculatedKey] as number;
          const counted = closing[countedKey] as number | null;
          const discrepancy = closing[discrepancyKey] as number | null;

          return (
            <div key={method} className="method-row">
              <span className="method-name">{method}</span>
              <span className="method-calculated">{formatGuaranies(calculated)}</span>
              {closing.arqueo_enabled && counted !== null && discrepancy !== null ? (
                <>
                  <span className="method-counted">{formatGuaranies(counted)}</span>
                  <span className={`method-discrepancy ${discrepancy > 0 ? 'surplus' : discrepancy < 0 ? 'shortage' : ''}`}>
                    {formatSigned(discrepancy)}
                  </span>
                </>
              ) : null}
            </div>
          );
        })}
      </div>

      {!closing.arqueo_enabled && <p className="no-arqueo">Sin arqueo (conteo no requerido)</p>}

      <style>{`
        .closing-methods {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .method-row {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr 1fr;
          gap: 8px;
          font-size: 13px;
          color: var(--text-secondary);
        }

        .method-name {
          text-transform: capitalize;
          font-weight: 600;
        }

        .no-arqueo {
          margin-top: 8px;
          font-size: 12px;
          color: var(--text-muted);
        }

        .method-discrepancy.surplus { color: #16a34a; }
        .method-discrepancy.shortage { color: #dc2626; }
      `}</style>
    </>
  );
}
