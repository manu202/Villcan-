'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useBranch } from '@/contexts/BranchContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useToast } from '@/contexts/ToastContext';

interface StoreBranchRow {
  id: string;
  name: string;
  whatsapp_number: string | null;
  slug: string | null;
  storefront_enabled: boolean;
}

export default function StorePage() {
  const { branches } = useBranch();
  const { settings, refreshSettings } = useSettings();

  const isAdminAnywhere = branches.some((b) => b.user_role === 'admin');

  if (!isAdminAnywhere) {
    return (
      <div className="page">
        <header className="page-header">
          <Link href="/settings" className="back-link">← Configuración</Link>
          <h1 className="page-title">Tienda</h1>
        </header>
        <div className="empty-state">
          <p>Acceso restringido</p>
          <p className="page-subtitle">Solo un administrador puede ver esta página.</p>
        </div>
        <style>{PAGE_STYLES}</style>
      </div>
    );
  }

  return (
    <StoreForm
      key={settings.updated_at}
      businessName={settings.business_name}
      refreshSettings={refreshSettings}
      branchRoles={branches}
    />
  );
}

function StoreForm({
  businessName,
  refreshSettings,
  branchRoles,
}: {
  businessName: string;
  refreshSettings: () => Promise<void>;
  branchRoles: { id: string; user_role: 'admin' | 'barber' | 'viewer' }[];
}) {
  const [name, setName] = useState(businessName);
  const [savingName, setSavingName] = useState(false);
  const { showToast } = useToast();

  // Real host, whatever it is (Vercel's default *.vercel.app domain today, a
  // custom domain later if one gets configured) — never hardcode one. Read in
  // an effect, not inline, so SSR's placeholder (no window) doesn't mismatch
  // what the client renders after hydration.
  const [storeHost, setStoreHost] = useState('');
  useEffect(() => setStoreHost(window.location.host), []);

  const [branches, setBranches] = useState<StoreBranchRow[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(true);
  const [whatsappDrafts, setWhatsappDrafts] = useState<Record<string, string>>({});
  const [savingBranchId, setSavingBranchId] = useState<string | null>(null);

  const canManage = (branchId: string) =>
    branchRoles.find((b) => b.id === branchId)?.user_role === 'admin';

  const loadBranches = async () => {
    setLoadingBranches(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from('branches')
      .select('id, name, whatsapp_number, slug, storefront_enabled')
      .order('name');

    if (error) {
      showToast(error.message, 'error');
    } else {
      const rows = (data || []) as StoreBranchRow[];
      setBranches(rows);
      setWhatsappDrafts(
        Object.fromEntries(rows.map((b) => [b.id, b.whatsapp_number || '']))
      );
    }
    setLoadingBranches(false);
  };

  useEffect(() => {
    loadBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    setSavingName(true);

    const supabase = createClient();
    const { error } = await supabase
      .from('business_settings')
      .update({ business_name: name })
      .eq('id', 1);

    if (error) {
      showToast(error.message, 'error');
      setSavingName(false);
      return;
    }

    await refreshSettings();
    // business_name changing recomputes every branch's slug server-side
    // (business_settings_recompute_slugs trigger) — refetch to reflect it.
    await loadBranches();
    setSavingName(false);
    showToast('Nombre del negocio guardado', 'success');
  }

  async function handleSaveWhatsapp(branchId: string) {
    setSavingBranchId(branchId);
    const supabase = createClient();
    const value = whatsappDrafts[branchId]?.trim() || null;

    const { error } = await supabase
      .from('branches')
      .update({ whatsapp_number: value })
      .eq('id', branchId);

    if (error) {
      showToast(error.message, 'error');
    } else {
      await loadBranches();
      showToast('WhatsApp guardado', 'success');
    }
    setSavingBranchId(null);
  }

  return (
    <div className="page">
      <header className="page-header">
        <Link href="/settings" className="back-link">← Configuración</Link>
        <h1 className="page-title">Tienda</h1>
      </header>

      <section className="section">
        <form onSubmit={handleSaveName} className="form">
          <div className="field">
            <label htmlFor="business_name">Nombre del negocio</label>
            <input
              id="business_name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              placeholder="Ej: Barbería El Toque"
              required
            />
          </div>
          <div className="actions">
            <button type="submit" className="btn-primary" disabled={savingName}>
              {savingName ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </section>

      <section className="section">
        <h2 className="section-title">Sucursales</h2>
        {loadingBranches ? (
          <p className="page-subtitle">Cargando...</p>
        ) : (
          <ul className="branch-list">
            {branches.map((branch) => {
              const editable = canManage(branch.id);
              return (
                <li key={branch.id} className="branch-item">
                  <div className="branch-info">
                    <span className="branch-name">{branch.name}</span>
                    <span
                      className={`branch-badge ${
                        branch.storefront_enabled ? 'storefront-active' : ''
                      }`}
                    >
                      {branch.storefront_enabled ? 'Activa' : 'Inactiva'}
                    </span>
                  </div>

                  <p className="slug-preview">
                    {branch.slug
                      ? `${storeHost || 'tu-dominio'}/tienda/${branch.slug}`
                      : 'La URL se generará al guardar'}
                  </p>

                  <div className="field field-inline">
                    <label htmlFor={`whatsapp-${branch.id}`}>WhatsApp</label>
                    <input
                      id={`whatsapp-${branch.id}`}
                      type="tel"
                      value={whatsappDrafts[branch.id] ?? ''}
                      onChange={(e) =>
                        setWhatsappDrafts({ ...whatsappDrafts, [branch.id]: e.target.value })
                      }
                      className="input"
                      placeholder="Ej: 595981234567"
                      disabled={!editable}
                    />
                    <button
                      type="button"
                      className="btn-small"
                      disabled={!editable || savingBranchId === branch.id}
                      onClick={() => handleSaveWhatsapp(branch.id)}
                    >
                      {savingBranchId === branch.id ? 'Guardando...' : 'Guardar'}
                    </button>
                  </div>
                  {!editable && (
                    <p className="hint">Sin permisos de administrador en esta sucursal</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <style>{PAGE_STYLES}</style>
    </div>
  );
}

const PAGE_STYLES = `
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

  .section {
    margin-bottom: 24px;
  }

  .section-title {
    font-size: 16px;
    font-weight: 700;
    margin-bottom: 12px;
  }

  .form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .field-inline {
    flex-direction: row;
    align-items: center;
    flex-wrap: wrap;
  }

  .field-inline label {
    min-width: 70px;
  }

  .field-inline .input {
    flex: 1;
    min-width: 140px;
  }

  .field label {
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
    color: var(--text-primary);
  }

  .input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .actions {
    display: flex;
    gap: 12px;
  }

  .btn-primary {
    flex: 1;
    padding: 14px;
    background: var(--accent);
    color: var(--accent-foreground);
    border: none;
    border-radius: 8px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    min-height: 44px;
  }

  .btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-small {
    padding: 8px 12px;
    background: var(--surface-elevated);
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
    min-height: 44px;
  }

  .btn-small:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .branch-list {
    list-style: none;
  }

  .branch-item {
    padding: 16px;
    background: var(--surface-elevated);
    border-radius: 12px;
    margin-bottom: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .branch-info {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .branch-name {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .branch-badge {
    display: inline-block;
    padding: 4px 8px;
    background: var(--surface);
    color: var(--text-secondary);
    border: 1px solid var(--border);
    font-size: 11px;
    font-weight: 600;
    border-radius: 4px;
  }

  .branch-badge.storefront-active {
    background: var(--accent);
    color: var(--accent-foreground);
    border-color: var(--accent);
  }

  .slug-preview {
    font-size: 12px;
    color: var(--text-secondary);
  }

  .hint {
    font-size: 12px;
    color: var(--text-muted);
  }
`;
