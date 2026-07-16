'use client';

import { useState } from 'react';
import { useBranch } from '@/contexts/BranchContext';
import { useSettings } from '@/contexts/SettingsContext';
import { createClient } from '@/lib/supabase/client';
import { Toggle } from '@/components/Toggle';
import type { BusinessSettings } from '@/types';

const ACCENT_PRESETS: { key: string; label: string }[] = [
  { key: 'slate', label: 'Pizarra' },
  { key: 'emerald', label: 'Esmeralda' },
  { key: 'blue', label: 'Azul' },
  { key: 'violet', label: 'Violeta' },
  { key: 'rose', label: 'Rosa' },
  { key: 'amber', label: 'Ámbar' },
  { key: 'teal', label: 'Verde azulado' },
  { key: 'pink', label: 'Rosado' },
];

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
  const [brandColor, setBrandColor] = useState(settings.brand_color);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Optimistic, flash-free preview: cache immediately + stamp <html> so the
  // swatch choice is visible right away, before the DB round-trip settles
  // (REQ-THEME-5). SettingsContext.refreshSettings() reconciles with the DB
  // value (source of truth) after a successful save.
  function selectBrandColor(key: string) {
    setBrandColor(key);
    try {
      window.localStorage.setItem('brand_color', key);
    } catch {
      // non-fatal — DB remains source of truth
    }
    document.documentElement.setAttribute('data-accent', key);
  }

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
        brand_color: brandColor,
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
          <span id="commissions_enabled-label">Comisiones</span>
          <Toggle
            checked={commissionsEnabled}
            onChange={setCommissionsEnabled}
            label="Comisiones"
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
          <span id="split_payment_enabled-label">Pago dividido</span>
          <Toggle
            checked={splitPaymentEnabled}
            onChange={setSplitPaymentEnabled}
            label="Pago dividido"
          />
        </div>

        <div className="field field-toggle">
          <span id="mandatory_arqueo_enabled-label">Arqueo obligatorio</span>
          <Toggle
            checked={mandatoryArqueoEnabled}
            onChange={setMandatoryArqueoEnabled}
            label="Arqueo obligatorio"
          />
        </div>

        <div className="field field-toggle">
          <span id="inventory_enabled-label">Inventario</span>
          <Toggle
            checked={inventoryEnabled}
            onChange={setInventoryEnabled}
            label="Inventario"
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

        <div className="field">
          <span id="brand_color-label">Color de marca</span>
          <div
            className="swatch-picker"
            role="radiogroup"
            aria-labelledby="brand_color-label"
          >
            {ACCENT_PRESETS.map((preset) => (
              <button
                key={preset.key}
                type="button"
                role="radio"
                aria-checked={brandColor === preset.key}
                aria-label={preset.label}
                title={preset.label}
                data-accent={preset.key}
                className={`swatch ${brandColor === preset.key ? 'swatch-selected' : ''}`}
                onClick={() => selectBrandColor(preset.key)}
              />
            ))}
          </div>
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

        .field label,
        .field > span {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .field input[type="text"],
        .field input[type="number"] {
          padding: 12px 16px;
          font-size: 16px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--surface);
          color: var(--text-primary);
        }

        .field input[type="text"]:focus,
        .field input[type="number"]:focus {
          outline: none;
          border-color: var(--accent);
        }

        .swatch-picker {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 4px;
        }

        .swatch {
          width: 36px;
          height: 36px;
          min-width: 36px;
          min-height: 36px;
          border-radius: 50%;
          border: 2px solid var(--border);
          background: var(--accent);
          cursor: pointer;
          transition: transform 0.15s ease, border-color 0.15s ease;
        }

        .swatch:hover {
          transform: scale(1.08);
        }

        .swatch-selected {
          border-color: var(--text-primary);
          box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--text-primary);
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
