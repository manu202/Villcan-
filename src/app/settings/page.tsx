'use client';

import { useState } from 'react';
import { useBranch } from '@/contexts/BranchContext';
import { useSettings } from '@/contexts/SettingsContext';
import { createClient } from '@/lib/supabase/client';
import type { BusinessSettings } from '@/types';

export default function SettingsPage() {
  const { branches } = useBranch();
  const { settings, refreshSettings } = useSettings();

  const isAdminAnywhere = branches.some((b) => b.user_role === 'admin');

  if (!isAdminAnywhere) {
    return (
      <div className="page">
        <header className="page-header">
          <h1 className="page-title">Configuración</h1>
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
  return <SettingsForm key={settings.updated_at} settings={settings} refreshSettings={refreshSettings} />;
}

function SettingsForm({
  settings,
  refreshSettings,
}: {
  settings: BusinessSettings;
  refreshSettings: () => Promise<void>;
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
  const [servicesLabel, setServicesLabel] = useState(settings.services_label);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from('business_settings')
      .update({
        commissions_enabled: commissionsEnabled,
        default_commission_pct: parseFloat(defaultCommissionPct) || 0,
        split_payment_enabled: splitPaymentEnabled,
        mandatory_arqueo_enabled: mandatoryArqueoEnabled,
        inventory_enabled: inventoryEnabled,
        services_label: servicesLabel,
      })
      .eq('id', 1);

    if (updateError) {
      setError(updateError.message);
      setSubmitting(false);
      return;
    }

    await refreshSettings();
    setSubmitting(false);
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-title">Configuración</h1>
      </header>

      <form onSubmit={handleSubmit} className="form">
        <div className="field field-toggle">
          <label htmlFor="commissions_enabled">Comisiones</label>
          <input
            id="commissions_enabled"
            type="checkbox"
            checked={commissionsEnabled}
            onChange={(e) => setCommissionsEnabled(e.target.checked)}
          />
        </div>

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

        <div className="field field-toggle">
          <label htmlFor="split_payment_enabled">Pago dividido</label>
          <input
            id="split_payment_enabled"
            type="checkbox"
            checked={splitPaymentEnabled}
            onChange={(e) => setSplitPaymentEnabled(e.target.checked)}
          />
        </div>

        <div className="field field-toggle">
          <label htmlFor="mandatory_arqueo_enabled">Arqueo obligatorio</label>
          <input
            id="mandatory_arqueo_enabled"
            type="checkbox"
            checked={mandatoryArqueoEnabled}
            onChange={(e) => setMandatoryArqueoEnabled(e.target.checked)}
          />
        </div>

        <div className="field field-toggle">
          <label htmlFor="inventory_enabled">Inventario</label>
          <input
            id="inventory_enabled"
            type="checkbox"
            checked={inventoryEnabled}
            onChange={(e) => setInventoryEnabled(e.target.checked)}
          />
        </div>

        <div className="field">
          <label htmlFor="services_label">Nombre de servicios</label>
          <input
            id="services_label"
            type="text"
            value={servicesLabel}
            onChange={(e) => setServicesLabel(e.target.value)}
            required
          />
        </div>

        {error && <p className="error">{error}</p>}

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

        .page-title {
          font-size: 24px;
          font-weight: 700;
        }

        .page-subtitle {
          font-size: 14px;
          color: var(--gray-500);
          margin-top: 4px;
        }

        .empty-state {
          text-align: center;
          padding: 48px 24px;
          color: var(--gray-500);
        }

        .form {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .field {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .field-toggle {
          flex-direction: row;
          align-items: center;
          justify-content: space-between;
        }

        .field label {
          font-size: 14px;
          font-weight: 600;
          color: var(--black);
        }

        .field input[type="text"],
        .field input[type="number"] {
          padding: 12px 16px;
          font-size: 16px;
          border: 1px solid var(--gray-200);
          border-radius: 8px;
          background: var(--white);
        }

        .field input[type="text"]:focus,
        .field input[type="number"]:focus {
          outline: none;
          border-color: var(--black);
        }

        .field input[type="checkbox"] {
          width: 20px;
          height: 20px;
        }

        .error {
          color: #dc2626;
          font-size: 14px;
          padding: 12px;
          background: #fef2f2;
          border-radius: 8px;
        }

        .actions {
          display: flex;
          gap: 12px;
          margin-top: 8px;
        }

        .submit-btn {
          flex: 1;
          padding: 14px;
          background: var(--black);
          color: var(--white);
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
