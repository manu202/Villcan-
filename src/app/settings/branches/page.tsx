'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useBranch } from '@/contexts/BranchContext';
import { ConfirmModal } from '@/components/ConfirmModal';
import type { Branch } from '@/types';

export default function BranchesPage() {
  const { currentBranch, branches, isLoading } = useBranch();
  const isAdminAnywhere = branches.some((b) => b.user_role === 'admin');
  const [allBranches, setAllBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [formData, setFormData] = useState({ name: '', address: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [branchPendingDelete, setBranchPendingDelete] = useState<Branch | null>(null);

  const loadBranches = async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('branches')
      .select('*')
      .order('name');
    setAllBranches(data || []);
    setLoading(false);
  };

  useEffect(() => {
    const load = async () => {
      await loadBranches();
    };
    load();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    const supabase = createClient();

    if (editingBranch) {
      // Update
      const { error } = await supabase
        .from('branches')
        .update({ name: formData.name, address: formData.address })
        .eq('id', editingBranch.id);
      if (error) setError(error.message);
      else {
        setSuccess('Sucursal actualizada');
        setShowForm(false);
        setEditingBranch(null);
        setFormData({ name: '', address: '' });
        loadBranches();
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

      if (error) setError(error.message);
      else {
        // Self-grant admin access on the branch we just created — required by RLS
        // (branches_select only shows branches the user has a user_branch_access row for).
        const { data: userData } = await supabase.auth.getUser();
        if (userData.user) {
          const { error: accessError } = await supabase
            .from('user_branch_access')
            .insert({ user_id: userData.user.id, branch_id: newBranchId, role: 'admin' });
          if (accessError) setError(accessError.message);
        }
        setSuccess('Sucursal creada');
        setShowForm(false);
        setFormData({ name: '', address: '' });
        loadBranches();
      }
    }
    setSaving(false);
  };

  const handleEdit = (branch: Branch) => {
    setEditingBranch(branch);
    setFormData({ name: branch.name, address: branch.address || '' });
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingBranch(null);
    setFormData({ name: '', address: '' });
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

    if (error) setError(error.message);
    else {
      setSuccess('Sucursal eliminada');
      loadBranches();
    }
  };

  if (!isAdminAnywhere) {
    return (
      <div className="page">
        <header className="page-header">
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

  if (loading || isLoading) {
    return (
      <div className="page">
        <header className="page-header">
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
      <header className="page-header flex-header">
        <h1 className="page-title">Sucursales</h1>
        {!showForm && (
          <button onClick={() => setShowForm(true)} className="btn-add">
            +Nueva
          </button>
        )}
      </header>

      {error && (
        <section className="section">
          <p className="error-text">{error}</p>
        </section>
      )}

      {success && (
        <section className="section">
          <p className="success-text">{success}</p>
        </section>
      )}

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
              required
            />
            <input
              type="text"
              placeholder="Dirección (opcional)"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="input"
            />
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
        {allBranches.length === 0 ? (
          <p className="page-subtitle">No hay sucursales</p>
        ) : (
          <ul className="branch-list">
            {allBranches.map((branch) => (
              <li key={branch.id} className="branch-item">
                <div className="branch-info">
                  <span className="branch-name">{branch.name}</span>
                  {branch.address && (
                    <span className="branch-address">{branch.address}</span>
                  )}
                  {currentBranch?.id === branch.id && (
                    <span className="branch-badge">Actual</span>
                  )}
                </div>
                <div className="branch-actions">
                  <button
                    onClick={() => handleEdit(branch)}
                    className="btn-small"
                  >
                    Editar
                  </button>
                  {allBranches.length > 1 && (
                    <button
                      onClick={() => setBranchPendingDelete(branch)}
                      className="btn-small btn-danger"
                    >
                      Eliminar
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="page-footer">
        <p className="hint">@{currentBranch?.name || 'Sin sucursal'}</p>
      </footer>

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
        }

        .form {
          display: flex;
          flex-direction: column;
          gap: 12px;
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
        }

        .btn-small {
          padding: 8px 12px;
          background: var(--surface-elevated);
          border: 1px solid var(--border);
          border-radius: 6px;
          font-size: 13px;
          cursor: pointer;
        }

        .btn-danger {
          color: #dc2626;
          border-color: #dc2626;
        }

        .error-text {
          color: #dc2626;
          font-size: 14px;
          text-align: center;
          padding: 12px;
          background: #fef2f2;
          border-radius: 8px;
        }

        .success-text {
          color: #16a34a;
          font-size: 14px;
          text-align: center;
          padding: 12px;
          background: #f0fdf4;
          border-radius: 8px;
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

        .branch-badge {
          display: inline-block;
          padding: 4px 8px;
          background: var(--accent);
          color: var(--accent-foreground);
          font-size: 11px;
          font-weight: 600;
          border-radius: 4px;
          margin-top: 4px;
        }

        .branch-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .page-footer {
          text-align: center;
          padding: 24px;
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
