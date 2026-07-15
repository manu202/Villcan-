'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useBranch } from '@/contexts/BranchContext';
import type { Branch } from '@/types';

export default function BranchesPage() {
  const { currentBranch, isLoading } = useBranch();
  const [allBranches, setAllBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [formData, setFormData] = useState({ name: '', address: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
      // Create
      const { error } = await supabase
        .from('branches')
        .insert({ name: formData.name, address: formData.address });
      if (error) setError(error.message);
      else {
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

  const handleDelete = async (branchId: string) => {
    if (!confirm('¿Eliminar esta sucursal? Los movimientos asociados se perderán.')) return;

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

  const handleAddUserAccess = async (branchId: string) => {
    const email = prompt('Email del usuario a agregar:');
    if (!email) return;

    const supabase = createClient();
    
    // Find user by email
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .single();

    if (!profile) {
      setError('Usuario no encontrado');
      return;
    }

    const { error } = await supabase
      .from('user_branch_access')
      .insert({ user_id: profile.id, branch_id: branchId, role: 'barber' });

    if (error) setError(error.message);
    else setSuccess(`Usuario ${email} agregado a la sucursal`);
  };

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
                    onClick={() => handleAddUserAccess(branch.id)}
                    className="btn-small"
                    title="Agregar usuario"
                  >
                    +Usuario
                  </button>
                  <button
                    onClick={() => handleEdit(branch)}
                    className="btn-small"
                  >
                    Editar
                  </button>
                  {allBranches.length > 1 && (
                    <button
                      onClick={() => handleDelete(branch.id)}
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
          background: var(--black);
          color: var(--white);
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
          background: var(--black);
          color: var(--white);
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
        }

        .btn-secondary {
          padding: 14px 24px;
          background: var(--gray-100);
          color: var(--black);
          border: 1px solid var(--gray-300);
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
        }

        .btn-small {
          padding: 8px 12px;
          background: var(--gray-100);
          border: 1px solid var(--gray-200);
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
          background: var(--gray-50);
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
          color: var(--black);
        }

        .branch-address {
          font-size: 13px;
          color: var(--gray-500);
        }

        .branch-badge {
          display: inline-block;
          padding: 4px 8px;
          background: var(--black);
          color: var(--white);
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
          color: var(--gray-400);
        }

        .input {
          width: 100%;
          padding: 14px 16px;
          border: 1px solid var(--gray-200);
          border-radius: 8px;
          font-size: 16px;
        }

        .input:focus {
          outline: none;
          border-color: var(--black);
        }
      `}</style>
    </div>
  );
}
