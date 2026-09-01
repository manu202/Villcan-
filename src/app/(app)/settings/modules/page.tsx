'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useBranch } from '@/contexts/BranchContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useToast } from '@/contexts/ToastContext';
import { createClient } from '@/lib/supabase/client';
import { Toggle } from '@/components/Toggle';
import type { BusinessSettings, BusinessVertical } from '@/types';

export default function ModulesPage() {
  const { branches, currentBranch } = useBranch();
  const { settings, refreshSettings } = useSettings();

  const isAdminAnywhere = branches.some((b) => b.user_role === 'admin');

  if (!isAdminAnywhere) {
    return (
      <div className="page">
        <header className="page-header">
          <Link href="/settings" className="back-link">← Configuración</Link>
          <h1 className="page-title">Módulos</h1>
        </header>
        <div className="empty-state">
          <p>Acceso restringido</p>
          <p className="page-subtitle">Solo un administrador puede ver esta página.</p>
        </div>
      </div>
    );
  }

  // Keyed by updated_at: remounts the form whenever settings load/change so its
  // local state re-initializes from the new values, without syncing via an effect.
  return (
    <ModulesForm
      key={settings.updated_at}
      settings={settings}
      refreshSettings={refreshSettings}
      currentVertical={currentBranch?.vertical ?? 'generic'}
    />
  );
}

function ModulesForm({
  settings,
  refreshSettings,
  currentVertical,
}: {
  settings: BusinessSettings;
  refreshSettings: () => Promise<void>;
  currentVertical: BusinessVertical;
}) {
  const [commissionsEnabled, setCommissionsEnabled] = useState(settings.commissions_enabled);
  const [defaultCommissionPct, setDefaultCommissionPct] = useState(
    String(settings.default_commission_pct)
  );
  const [splitPaymentEnabled, setSplitPaymentEnabled] = useState(settings.split_payment_enabled);
  const [mandatoryArqueoEnabled, setMandatoryArqueoEnabled] = useState(
    settings.mandatory_arqueo_enabled
  );
  const [inventoryEnabled, setInventoryEnabled] = useState(settings.inventory_enabled);

  const [submitting, setSubmitting] = useState(false);
  const { showToast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from('business_settings')
      .update({
        commissions_enabled: commissionsEnabled,
        default_commission_pct: parseFloat(defaultCommissionPct) || 0,
        split_payment_enabled: splitPaymentEnabled,
        mandatory_arqueo_enabled: mandatoryArqueoEnabled,
        inventory_enabled: inventoryEnabled,
      })
      .eq('id', 1);

    if (updateError) {
      showToast(updateError.message, 'error');
      setSubmitting(false);
      return;
    }

    await refreshSettings();
    setSubmitting(false);
    showToast('Configuración guardada', 'success');
  }

  return (
    <div className="page">
      <header className="page-header">
        <Link href="/settings" className="back-link">← Configuración</Link>
        <h1 className="page-title">Módulos</h1>
      </header>

      <form onSubmit={handleSubmit} className="form">
        {currentVertical === 'barbershop' && (
          <>
            <div className="field field-toggle">
              <span id="commissions_enabled-label">Comisiones</span>
              <Toggle
                checked={commissionsEnabled}
                onChange={setCommissionsEnabled}
                label="Comisiones"
              />
            </div>
            <p className="field-hint">Calcula y descuenta un % de comisión en cada servicio cobrado.</p>

            <div className="field">
              <label htmlFor="default_commission_pct">Comisión por defecto (%)</label>
              <input
                id="default_commission_pct"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={defaultCommissionPct}
                disabled={!commissionsEnabled}
                onChange={(e) => setDefaultCommissionPct(e.target.value)}
              />
            </div>
          </>
        )}

        <div className="field field-toggle">
          <span id="split_payment_enabled-label">Pago dividido</span>
          <Toggle
            checked={splitPaymentEnabled}
            onChange={setSplitPaymentEnabled}
            label="Pago dividido"
          />
        </div>
        <p className="field-hint">Permite cobrar un movimiento combinando más de un método de pago.</p>

        <div className="field field-toggle">
          <span id="mandatory_arqueo_enabled-label">Arqueo obligatorio</span>
          <Toggle
            checked={mandatoryArqueoEnabled}
            onChange={setMandatoryArqueoEnabled}
            label="Arqueo obligatorio"
          />
        </div>
        <p className="field-hint">Exige cerrar caja (arqueo) antes de poder abrir una nueva.</p>

        <div className="field field-toggle">
          <span id="inventory_enabled-label">Inventario</span>
          <Toggle
            checked={inventoryEnabled}
            onChange={setInventoryEnabled}
            label="Inventario"
          />
        </div>
        <p className="field-hint">Habilita el control de stock de productos y servicios.</p>

        <div className="actions">
          <button type="submit" className="submit-btn" disabled={submitting}>
            {submitting ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </form>

      <style>{`
        .page {
          max-width: 480px;
          margin: 0 auto;
        }

        .page-header {
          margin-bottom: 32px;
        }

        .back-link {
          display: inline-block;
          font-size: 14px;
          color: var(--text-secondary);
          text-decoration: none;
          margin-bottom: 8px;
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

        .empty-state {
          text-align: center;
          padding: 48px 24px;
          color: var(--text-secondary);
        }

        .form {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .field {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 12px;
        }

        .field-toggle {
          flex-direction: row;
          align-items: center;
          justify-content: space-between;
          margin-top: 20px;
        }

        .field label,
        .field > span {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .field-hint {
          font-size: 12px;
          color: var(--text-secondary);
          margin: 0;
        }

        .field input[type="number"] {
          padding: 12px 16px;
          font-size: 16px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--surface);
          color: var(--text-primary);
        }

        .field input[type="number"]:focus {
          outline: none;
          border-color: var(--accent);
        }

        .actions {
          display: flex;
          gap: 12px;
          margin-top: 24px;
        }

        .submit-btn {
          flex: 1;
          padding: 14px;
          background: var(--accent);
          color: var(--accent-foreground);
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
        }

        .submit-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
