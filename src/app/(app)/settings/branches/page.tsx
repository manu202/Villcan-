'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ExternalLink, Globe } from 'lucide-react';
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

const VERTICAL_LABEL: Record<BusinessVertical, string> = Object.fromEntries(
  VERTICAL_OPTIONS.map((opt) => [opt.value, opt.label])
) as Record<BusinessVertical, string>;

interface StorefrontRow {
  whatsapp_number: string | null;
  slug: string | null;
  storefront_enabled: boolean;
}

export default function BranchesPage() {
  const router = useRouter();
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
  const [storeOrigin, setStoreOrigin] = useState('');
  useEffect(() => setStoreOrigin(window.location.origin), []);

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
      // Client-generated id to avoid RLS read-back issue on insert
      const newBranchId = crypto.randomUUID();
      const { error } = await supabase
        .from('branches')
        .insert({
          id: newBranchId,
          name: formData.name,
          address: formData.address,
          vertical: formData.vertical,
          whatsapp_number: formData.whatsapp.trim() || null,
        });

      if (error) showToast(error.message, 'error');
      else {
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
        loadStorefrontData();
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
    const { error } = await supabase.from('branches').delete().eq('id', branchId);

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
          <button type="button" onClick={() => router.back()} className="back-btn">←</button>
          <h1 className="page-title">Sucursales</h1>
        </header>
        <p className="page-subtitle">Solo un administrador puede ver esta página.</p>
        <PageStyles />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="page">
        <header className="page-header flex-header">
          <button type="button" onClick={() => router.back()} className="back-btn">←</button>
          <h1 className="page-title">Sucursales</h1>
        </header>
        <p className="page-subtitle">Cargando...</p>
        <PageStyles />
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header flex-header">
        <button type="button" onClick={() => router.back()} className="back-btn">←</button>
        <h1 className="page-title">Sucursales</h1>
        {!showForm && (
          <button type="button" onClick={() => setShowForm(true)} className="btn-new">
            + Nueva
          </button>
        )}
      </header>

      {showForm && (
        <div className="form-card">
          <h2 className="form-card-title">
            {editingBranch ? `Editar ${editingBranch.name}` : 'Nueva sucursal'}
          </h2>
          <form onSubmit={handleSubmit} className="form">
            <label className="field">
              <span className="field-label">Nombre</span>
              <input
                type="text"
                placeholder="Nombre de la sucursal"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="input"
                autoFocus
                required
              />
            </label>

            <label className="field">
              <span className="field-label">Dirección <span className="optional">(opcional)</span></span>
              <input
                type="text"
                placeholder="Ej: Av. Principal 123"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="input"
              />
            </label>

            <div className="field">
              <span className="field-label">Rubro</span>
              <select
                value={formData.vertical}
                onChange={(e) => setFormData({ ...formData, vertical: e.target.value as BusinessVertical })}
                className="input"
              >
                {VERTICAL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <span className="field-hint">Define el diseño de la tienda pública de esta sucursal.</span>
            </div>

            <div className="field">
              <span className="field-label">WhatsApp</span>
              <input
                type="tel"
                value={formData.whatsapp}
                onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                className="input"
                placeholder="Ej: 595981234567"
              />
              <span className="field-hint">Al cargarlo, la tienda pública se activa automáticamente.</span>
            </div>

            {editingBranch && storefrontData[editingBranch.id]?.slug && (
              <div className="storefront-preview">
                <Globe size={13} />
                <span>
                  {storeOrigin || 'tu-dominio'}/tienda/{storefrontData[editingBranch.id]?.slug}
                </span>
                <span className={`status-dot ${storefrontData[editingBranch.id]?.storefront_enabled ? 'active' : ''}`} />
                <span className="status-text">
                  {storefrontData[editingBranch.id]?.storefront_enabled ? 'Activa' : 'Inactiva'}
                </span>
              </div>
            )}

            <div className="form-actions">
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
              <button type="button" onClick={handleCancel} className="btn-secondary">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      <ul className="branch-list">
        {branches.map((branch) => {
          const isCurrent = currentBranch?.id === branch.id;
          const canManage = branch.user_role === 'admin';
          const sf = storefrontData[branch.id];

          return (
            <li key={branch.id} className={`branch-card ${isCurrent ? 'branch-card-active' : ''}`}>
              {isCurrent && <div className="active-indicator">Sucursal activa</div>}

              <div className="branch-main">
                <div className="branch-name-row">
                  <span className="branch-name">{branch.name}</span>
                  <span className="vertical-chip">{VERTICAL_LABEL[branch.vertical ?? 'generic']}</span>
                </div>
                {branch.address && (
                  <span className="branch-address">{branch.address}</span>
                )}
              </div>

              {sf?.storefront_enabled && sf.slug ? (
                <a
                  href={`${storeOrigin}/tienda/${sf.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="storefront-link"
                >
                  <Globe size={13} />
                  <span className="storefront-link-text">{storeOrigin}/tienda/{sf.slug}</span>
                  <ExternalLink size={11} className="ext-icon" />
                </a>
              ) : (
                <div className="no-storefront">Sin tienda pública</div>
              )}

              <div className="branch-footer">
                <span className="role-label">{ROLE_LABEL[branch.user_role]}</span>
                <div className="branch-actions">
                  {!isCurrent && (
                    <button type="button" onClick={() => selectBranch(branch)} className="btn-action">
                      Usar
                    </button>
                  )}
                  {canManage && (
                    <button type="button" onClick={() => handleEdit(branch)} className="btn-action">
                      Editar
                    </button>
                  )}
                  {canManage && branches.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setBranchPendingDelete(branch)}
                      className="btn-action btn-action-danger"
                    >
                      Eliminar
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {branchPendingDelete && (
        <ConfirmModal
          message={`¿Eliminar "${branchPendingDelete.name}"? Los movimientos asociados se perderán.`}
          confirmLabel="Eliminar"
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setBranchPendingDelete(null)}
        />
      )}

      <PageStyles />
    </div>
  );
}

function PageStyles() {
  return (
    <style>{`
      .page { max-width: 480px; margin: 0 auto; }

      .flex-header { display: flex; align-items: center; gap: 12px; }
      .back-btn {
        width: 40px; height: 40px; min-height: unset; min-width: unset;
        display: flex; align-items: center; justify-content: center;
        font-size: 22px; background: var(--surface-elevated);
        border-radius: 8px; border: none; color: var(--text-primary); cursor: pointer; flex-shrink: 0;
      }
      .btn-new {
        margin-left: auto; padding: 9px 16px; min-height: unset;
        background: var(--accent); color: var(--accent-foreground);
        border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;
      }

      /* Form card */
      .form-card {
        background: var(--surface); border: 1px solid var(--border);
        border-radius: 12px; padding: 20px; margin-bottom: 20px;
      }
      .form-card-title {
        font-size: 16px; font-weight: 700; color: var(--text-primary); margin-bottom: 16px;
      }
      .form { display: flex; flex-direction: column; gap: 14px; }
      .field { display: flex; flex-direction: column; gap: 6px; }
      .field-label { font-size: 13px; font-weight: 600; color: var(--text-primary); }
      .optional { font-weight: 400; color: var(--text-secondary); }
      .field-hint { font-size: 12px; color: var(--text-secondary); }
      .input {
        width: 100%; padding: 11px 14px; border: 1px solid var(--border);
        border-radius: 8px; font-size: 15px; background: var(--surface);
        color: var(--text-primary);
      }
      .input:focus { outline: none; border-color: var(--accent); }

      .storefront-preview {
        display: flex; align-items: center; gap: 7px;
        padding: 10px 12px; background: var(--surface-elevated);
        border: 1px solid var(--border); border-radius: 8px;
        font-size: 12px; color: var(--text-secondary);
      }
      .status-dot {
        width: 7px; height: 7px; border-radius: 50%;
        background: var(--text-secondary); flex-shrink: 0;
      }
      .status-dot.active { background: #16a34a; }
      .status-text { color: var(--text-secondary); font-size: 11px; }

      .form-actions { display: flex; gap: 10px; padding-top: 4px; }
      .btn-primary {
        flex: 1; padding: 13px; background: var(--accent); color: var(--accent-foreground);
        border: none; border-radius: 8px; font-size: 15px; font-weight: 600;
        cursor: pointer; min-height: 44px;
      }
      .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
      .btn-secondary {
        flex: 1; padding: 13px; background: var(--surface-elevated);
        color: var(--text-primary); border: 1px solid var(--border);
        border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; min-height: 44px;
      }

      /* Branch list */
      .branch-list { list-style: none; display: flex; flex-direction: column; gap: 10px; }

      .branch-card {
        background: var(--surface); border: 1px solid var(--border);
        border-radius: 12px; overflow: hidden;
      }
      .branch-card-active { border-color: var(--accent); }

      .active-indicator {
        background: var(--accent); color: var(--accent-foreground);
        font-size: 11px; font-weight: 700; letter-spacing: 0.05em;
        text-transform: uppercase; padding: 6px 16px;
      }

      .branch-main { padding: 14px 16px 10px; }
      .branch-name-row {
        display: flex; align-items: center; gap: 10px; margin-bottom: 4px;
      }
      .branch-name { font-size: 16px; font-weight: 700; color: var(--text-primary); }
      .vertical-chip {
        font-size: 11px; font-weight: 600; padding: 3px 8px;
        background: var(--surface-elevated); border: 1px solid var(--border);
        border-radius: 20px; color: var(--text-secondary); white-space: nowrap;
      }
      .branch-address { font-size: 13px; color: var(--text-secondary); }

      .storefront-link {
        display: flex; align-items: center; gap: 7px;
        padding: 8px 16px; border-top: 1px solid var(--border);
        font-size: 13px; color: var(--accent); text-decoration: none;
        font-weight: 500; overflow: hidden;
      }
      .storefront-link:hover { background: var(--surface-elevated); }
      .storefront-link-text {
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0;
      }
      .ext-icon { color: var(--text-secondary); flex-shrink: 0; }
      .no-storefront {
        padding: 8px 16px; border-top: 1px solid var(--border);
        font-size: 12px; color: var(--text-secondary);
      }

      .branch-footer {
        display: flex; align-items: center; justify-content: space-between;
        padding: 10px 16px; border-top: 1px solid var(--border);
        background: var(--surface-elevated);
      }
      .role-label { font-size: 12px; color: var(--text-secondary); }
      .branch-actions { display: flex; gap: 8px; }
      .btn-action {
        padding: 7px 12px; min-height: unset; min-width: unset;
        background: var(--surface); border: 1px solid var(--border);
        border-radius: 6px; font-size: 13px; font-weight: 500;
        color: var(--text-primary); cursor: pointer;
      }
      .btn-action:hover { border-color: var(--accent); }
      .btn-action-danger { color: #dc2626; border-color: rgba(220,38,38,.3); }
      .btn-action-danger:hover { background: rgba(220,38,38,.06); border-color: #dc2626; }
    `}</style>
  );
}
