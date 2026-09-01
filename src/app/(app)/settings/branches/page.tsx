'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useBranch } from '@/contexts/BranchContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useToast } from '@/contexts/ToastContext';
import { ConfirmModal } from '@/components/ConfirmModal';
import type { BranchWithRole, BusinessVertical } from '@/types';

const VERTICAL_OPTIONS: { value: BusinessVertical; label: string }[] = [
  { value: 'barbershop', label: 'Barbería' },
  { value: 'gastronomy', label: 'Gastronomía' },
  { value: 'retail', label: 'Venta de productos' },
  { value: 'generic', label: 'General' },
];

// Storefront fields (whatsapp/slug/storefront_enabled) aren't returned by
// useBranch()'s getUserBranches query (see src/lib/branches.ts) — fetched
// separately here, same as the old /settings/store page used to do, since
// that screen's functionality was folded into this one's edit form.
interface StorefrontRow {
  whatsapp_number: string | null;
  slug: string | null;
  storefront_enabled: boolean;
}

export default function BranchesPage() {
  const { currentBranch, branches, isLoading, selectBranch, refreshBranches } = useBranch();
  const { settings } = useSettings();

  const ROLE_LABEL: Record<BranchWithRole['user_role'], string> = {
    admin: 'Administrador',
    barber: settings.staff_label,
  };

  const isAdminAnywhere = branches.some((b) => b.user_role === 'admin');
  const [showForm, setShowForm] = useState(false);
  const [editingBranch, setEditingBranch] = useState<BranchWithRole | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    vertical: 'generic' as BusinessVertical,
    whatsapp: '',
  });
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();
  const [branchPendingDelete, setBranchPendingDelete] = useState<BranchWithRole | null>(null);

  const [storefrontData, setStorefrontData] = useState<Record<string, StorefrontRow>>({});
  // Real host, whatever it is (Vercel's default *.vercel.app domain today, a
  // custom domain later if one gets configured) — never hardcode one. Read in
  // an effect, not inline, so SSR's placeholder (no window) doesn't mismatch
  // what the client renders after hydration.
  const [storeHost, setStoreHost] = useState('');
  useEffect(() => setStoreHost(window.location.host), []);

  const loadStorefrontData = async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('branches')
      .select('id, whatsapp_number, slug, storefront_enabled');

    if (!error && data) {
      setStorefrontData(
        Object.fromEntries(
          (data as Array<{ id: string } & StorefrontRow>).map((b) => [
            b.id,
            {
              whatsapp_number: b.whatsapp_number,
              slug: b.slug,
              storefront_enabled: b.storefront_enabled,
            },
          ])
        )
      );
    }
  };

  useEffect(() => {
    loadStorefrontData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const supabase = createClient();

    if (editingBranch) {
      // Update
      const { error } = await supabase
        .from('branches')
        .update({
          name: formData.name,
          address: formData.address,
          vertical: formData.vertical,
          whatsapp_number: formData.whatsapp.trim() || null,
        })
        .eq('id', editingBranch.id);
      if (error) showToast(error.message, 'error');
      else {
        showToast('Sucursal actualizada', 'success');
        setShowForm(false);
        setEditingBranch(null);
        setFormData({ name: '', address: '', vertical: 'generic', whatsapp: '' });
        refreshBranches();
        loadStorefrontData();
      }
    } else {
      // Create. The new branch's id is generated CLIENT-SIDE (crypto.randomUUID())
      // and inserted explicitly, rather than reading it back via .select().single()
      // (RETURNING). Reason: branches_select's RLS policy (has_branch_access) can't
      // see the just-inserted row until the self-grant admin access row below
      // exists — a RETURNING/.select() on the insert would enforce that same
      // SELECT policy against the brand-new row and fail with "new row violates
      // row-level security policy for table branches" (verified live against
      // Supabase; the previous .select('id').single() pattern was broken).
      const newBranchId = crypto.randomUUID();
      const { error } = await supabase
        .from('branches')
        .insert({ id: newBranchId, name: formData.name, address: formData.address });

      if (error) showToast(error.message, 'error');
      else {
        // Self-grant admin access on the branch we just created — required by RLS
        // (branches_select only shows branches the user has a user_branch_access row for).
        const { data: userData } = await supabase.auth.getUser();
        if (userData.user) {
          const { error: accessError } = await supabase
            .from('user_branch_access')
            .insert({ user_id: userData.user.id, branch_id: newBranchId, role: 'admin' });
          if (accessError) showToast(accessError.message, 'error');
        }
        showToast('Sucursal creada', 'success');
        setShowForm(false);
        setFormData({ name: '', address: '', vertical: 'generic', whatsapp: '' });
        refreshBranches();
      }
    }
    setSaving(false);
  };

  const handleEdit = (branch: BranchWithRole) => {
    setEditingBranch(branch);
    setFormData({
      name: branch.name,
      address: branch.address || '',
      vertical: branch.vertical ?? 'generic',
      whatsapp: storefrontData[branch.id]?.whatsapp_number || '',
    });
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingBranch(null);
    setFormData({ name: '', address: '', vertical: 'generic', whatsapp: '' });
  };

  const handleDeleteConfirmed = async () => {
    if (!branchPendingDelete) return;
    const branchId = branchPendingDelete.id;
    setBranchPendingDelete(null);

    const supabase = createClient();
    const { error } = await supabase
      .from('branches')
      .delete()
      .eq('id', branchId);

    if (error) showToast(error.message, 'error');
    else {
      showToast('Sucursal eliminada', 'success');
      refreshBranches();
    }
  };

  if (!isAdminAnywhere) {
    return (
      <div className="page">
        <header className="page-header">
          <Link href="/settings" className="back-link">← Configuración</Link>
          <h1 className="page-title">Sucursales</h1>
        </header>
        <div className="empty-state">
          <p>Acceso restringido</p>
          <p className="page-subtitle">Solo un administrador puede ver esta página.</p>
        </div>
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
        `}</style>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="page">
        <header className="page-header">
          <Link href="/settings" className="back-link">← Configuración</Link>
          <h1 className="page-title">Sucursales</h1>
        </header>
        <section className="section">
          <p className="page-subtitle">Cargando...</p>
        </section>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <Link href="/settings" className="back-link">← Configuración</Link>
        <div className="flex-header">
          <h1 className="page-title">Sucursales</h1>
          {!showForm && (
            <button onClick={() => setShowForm(true)} className="btn-add">
              +Nueva
            </button>
          )}
        </div>
      </header>

      {showForm && (
        <section className="section">
          <form onSubmit={handleSubmit} className="form">
            <h2 className="section-title">
              {editingBranch ? 'Editar' : 'Nueva'} Sucursal
            </h2>
            <input
              type="text"
              placeholder="Nombre"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="input"
              autoFocus
              required
            />
            <input
              type="text"
              placeholder="Dirección (opcional)"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="input"
            />

            {editingBranch && (
              <>
                <div className="field">
                  <label htmlFor="vertical">Rubro</label>
                  <select
                    id="vertical"
                    value={formData.vertical}
                    onChange={(e) =>
                      setFormData({ ...formData, vertical: e.target.value as BusinessVertical })
                    }
                    className="input"
                  >
                    {VERTICAL_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="whatsapp">WhatsApp</label>
                  <input
                    id="whatsapp"
                    type="tel"
                    value={formData.whatsapp}
                    onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                    className="input"
                    placeholder="Ej: 595981234567"
                  />
                </div>

                <div className="storefront-info">
                  <span
                    className={`storefront-badge ${
                      storefrontData[editingBranch.id]?.storefront_enabled
                        ? 'storefront-badge-active'
                        : ''
                    }`}
                  >
                    {storefrontData[editingBranch.id]?.storefront_enabled ? 'Activa' : 'Inactiva'}
                  </span>
                  <p className="slug-preview">
                    {storefrontData[editingBranch.id]?.slug
                      ? `${storeHost || 'tu-dominio'}/tienda/${storefrontData[editingBranch.id]?.slug}`
                      : 'La URL se generará al guardar'}
                  </p>
                </div>
              </>
            )}

            <div className="btn-row">
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
              <button type="button" onClick={handleCancel} className="btn-secondary">
                Cancelar
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="section">
        <ul className="branch-list">
          {branches.map((branch) => {
            const isCurrent = currentBranch?.id === branch.id;
            const canManage = branch.user_role === 'admin';
            return (
              <li key={branch.id} className="branch-item">
                <div className="branch-info">
                  <span className="branch-name">{branch.name}</span>
                  {branch.address && (
                    <span className="branch-address">{branch.address}</span>
                  )}
                  <div className="branch-tags">
                    {isCurrent && <span className="branch-badge">Sucursal activa</span>}
                    <span className="branch-role">Tu rol: {ROLE_LABEL[branch.user_role]}</span>
                  </div>
                </div>
                <div className="branch-actions">
                  {!isCurrent && (
                    <button
                      onClick={() => selectBranch(branch)}
                      className="btn-small"
                    >
                      Usar esta sucursal
                    </button>
                  )}
                  {canManage ? (
                    <>
                      <button
                        onClick={() => handleEdit(branch)}
                        className="btn-small"
                      >
                        Editar
                      </button>
                      {branches.length > 1 && (
                        <button
                          onClick={() => setBranchPendingDelete(branch)}
                          className="btn-small btn-danger"
                        >
                          Eliminar
                        </button>
                      )}
                    </>
                  ) : (
                    <span className="hint">Sin permisos de administrador en esta sucursal</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {branchPendingDelete && (
        <ConfirmModal
          message={`¿Eliminar "${branchPendingDelete.name}"? Los movimientos asociados se perderán.`}
          confirmLabel="Eliminar"
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setBranchPendingDelete(null)}
        />
      )}

      <style>{`
        .page {
          max-width: 480px;
          margin: 0 auto;
        }

        .back-link {
          display: inline-block;
          font-size: 14px;
          color: var(--text-secondary);
          text-decoration: none;
          margin-bottom: 8px;
        }

        .flex-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .btn-add {
          padding: 10px 16px;
          background: var(--accent);
          color: var(--accent-foreground);
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          min-height: 44px;
          transition: opacity 0.15s ease;
        }

        .btn-add:hover {
          opacity: 0.85;
        }

        .btn-add:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
        }

        .form {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .field label {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .storefront-info {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .storefront-badge {
          display: inline-block;
          align-self: flex-start;
          padding: 4px 8px;
          background: var(--surface);
          color: var(--text-secondary);
          border: 1px solid var(--border);
          font-size: 11px;
          font-weight: 600;
          border-radius: 4px;
        }

        .storefront-badge-active {
          background: var(--accent);
          color: var(--accent-foreground);
          border-color: var(--accent);
        }

        .slug-preview {
          font-size: 12px;
          color: var(--text-secondary);
        }

        .btn-row {
          display: flex;
          gap: 12px;
        }

        .btn-row .btn-primary,
        .btn-row .btn-secondary {
          flex: 1;
        }

        .btn-primary {
          padding: 14px 24px;
          background: var(--accent);
          color: var(--accent-foreground);
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          min-height: 44px;
          transition: opacity 0.15s ease;
        }

        .btn-primary:hover {
          opacity: 0.85;
        }

        .btn-primary:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
        }

        .btn-secondary {
          padding: 14px 24px;
          background: var(--surface);
          color: var(--text-primary);
          border: 1px solid var(--border);
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          min-height: 44px;
          transition: border-color 0.15s ease;
        }

        .btn-secondary:hover {
          border-color: var(--accent-hover);
        }

        .btn-secondary:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
        }

        .btn-small {
          padding: 8px 12px;
          background: var(--surface-elevated);
          border: 1px solid var(--border);
          border-radius: 6px;
          font-size: 13px;
          cursor: pointer;
          min-height: 44px;
          transition: border-color 0.15s ease;
        }

        .btn-small:hover {
          border-color: var(--accent-hover);
        }

        .btn-small:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
        }

        .btn-danger {
          color: #dc2626;
          border-color: #dc2626;
        }

        .branch-list {
          list-style: none;
        }

        .branch-item {
          padding: 16px;
          background: var(--surface-elevated);
          border-radius: 12px;
          margin-bottom: 12px;
        }

        .branch-info {
          display: flex;
          flex-direction: column;
          gap: 4px;
          margin-bottom: 12px;
        }

        .branch-name {
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .branch-address {
          font-size: 13px;
          color: var(--text-secondary);
        }

        .branch-tags {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          margin-top: 4px;
        }

        .branch-badge {
          display: inline-block;
          padding: 4px 8px;
          background: var(--accent);
          color: var(--accent-foreground);
          font-size: 11px;
          font-weight: 600;
          border-radius: 4px;
        }

        .branch-role {
          font-size: 12px;
          color: var(--text-secondary);
        }

        .branch-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .branch-actions .btn-danger {
          margin-left: auto;
        }

        .hint {
          font-size: 12px;
          color: var(--text-muted);
        }

        .input {
          width: 100%;
          padding: 14px 16px;
          border: 1px solid var(--border);
          border-radius: 8px;
          font-size: 16px;
        }

        .input:focus {
          outline: none;
          border-color: var(--accent);
        }
      `}</style>
    </div>
  );
}
