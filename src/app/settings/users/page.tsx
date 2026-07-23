'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useBranch } from '@/contexts/BranchContext';
import { ConfirmModal } from '@/components/ConfirmModal';
import { isLastAdmin } from '@/lib/access';
import type { UserBranchAccess } from '@/types';

type AccessRole = UserBranchAccess['role'];

const ROLE_OPTIONS: { value: AccessRole; label: string }[] = [
  { value: 'admin', label: 'Administrador' },
  { value: 'barber', label: 'Barbero' },
  { value: 'viewer', label: 'Visor' },
];

interface AccessRow {
  user_id: string;
  role: AccessRole;
  email: string;
  full_name: string | null;
}

interface ProfileJoin {
  email: string;
  full_name: string | null;
}

interface RawAccessRow {
  user_id: string;
  role: AccessRole;
  profiles: ProfileJoin | ProfileJoin[] | null;
}

export default function UsersPage() {
  const { currentBranch, branches, isLoading: branchesLoading } = useBranch();

  const isAdminAnywhere = branches.some((b) => b.user_role === 'admin');
  const isAdminOfCurrentBranch = currentBranch?.user_role === 'admin';

  const [rows, setRows] = useState<AccessRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<AccessRole>('barber');
  const [adding, setAdding] = useState(false);

  const [rowPendingDelete, setRowPendingDelete] = useState<AccessRow | null>(null);

  const loadAccess = async () => {
    if (!currentBranch) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { data, error: loadError } = await supabase
      .from('user_branch_access')
      .select('user_id, role, profiles(email, full_name)')
      .eq('branch_id', currentBranch.id);

    if (loadError) {
      setError(loadError.message);
      setRows([]);
    } else {
      const list = (data || []) as unknown as RawAccessRow[];
      setRows(
        list.map((r) => {
          const profile = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
          return {
            user_id: r.user_id,
            role: r.role,
            email: profile?.email || '(sin email)',
            full_name: profile?.full_name ?? null,
          };
        })
      );
    }
    setLoading(false);
  };

  useEffect(() => {
    const load = async () => {
      await loadAccess();
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBranch?.id]);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentBranch) return;
    setAdding(true);
    setError(null);
    setSuccess(null);

    const supabase = createClient();
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', newEmail.trim())
      .single();

    if (!profile) {
      setError('Usuario no encontrado');
      setAdding(false);
      return;
    }

    if (rows.some((r) => r.user_id === profile.id)) {
      setError('Este usuario ya tiene acceso a esta sucursal');
      setAdding(false);
      return;
    }

    const { error: insertError } = await supabase
      .from('user_branch_access')
      .insert({ user_id: profile.id, branch_id: currentBranch.id, role: newRole });

    if (insertError) {
      setError(insertError.message);
    } else {
      setSuccess(`Usuario ${newEmail.trim()} agregado`);
      setNewEmail('');
      setNewRole('barber');
      await loadAccess();
    }
    setAdding(false);
  };

  const handleRoleChange = async (row: AccessRow, role: AccessRole) => {
    if (!currentBranch) return;
    setError(null);
    setSuccess(null);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from('user_branch_access')
      .update({ role })
      .eq('user_id', row.user_id)
      .eq('branch_id', currentBranch.id);

    if (updateError) setError(updateError.message);
    else await loadAccess();
  };

  const handleRemoveConfirmed = async () => {
    if (!rowPendingDelete || !currentBranch) return;
    const target = rowPendingDelete;
    setRowPendingDelete(null);
    setError(null);
    setSuccess(null);

    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from('user_branch_access')
      .delete()
      .eq('user_id', target.user_id)
      .eq('branch_id', currentBranch.id);

    if (deleteError) setError(deleteError.message);
    else {
      setSuccess('Acceso eliminado');
      await loadAccess();
    }
  };

  if (!isAdminAnywhere) {
    return (
      <div className="page">
        <header className="page-header">
          <h1 className="page-title">Usuarios</h1>
        </header>
        <div className="empty-state">
          <p>Acceso restringido</p>
          <p className="page-subtitle">Solo un administrador puede ver esta página.</p>
        </div>
        <style>{styles}</style>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-title">Usuarios</h1>
        <p className="page-subtitle">@{currentBranch?.name || 'Sin sucursal'}</p>
      </header>

      {!isAdminOfCurrentBranch && (
        <section className="section">
          <p className="notice-text">
            No sos administrador de esta sucursal. Cambiá a una sucursal que administrés para poder
            gestionar sus usuarios.
          </p>
        </section>
      )}

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

      {isAdminOfCurrentBranch && (
        <section className="section">
          <form onSubmit={handleAddUser} className="form">
            <h2 className="section-title">Agregar usuario</h2>
            <input
              type="email"
              placeholder="Email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="input"
              required
            />
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as AccessRole)}
              className="input"
              aria-label="Rol"
            >
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button type="submit" className="btn-primary" disabled={adding}>
              {adding ? 'Agregando...' : 'Agregar'}
            </button>
          </form>
        </section>
      )}

      <section className="section">
        {loading || branchesLoading ? (
          <p className="page-subtitle">Cargando...</p>
        ) : rows.length === 0 ? (
          <p className="page-subtitle">No hay usuarios con acceso a esta sucursal</p>
        ) : (
          <ul className="access-list">
            {rows.map((row) => {
              const locked = isAdminOfCurrentBranch && isLastAdmin(rows, row.user_id);
              return (
                <li key={row.user_id} className="access-item">
                  <div className="access-info">
                    <span className="access-name">{row.full_name || row.email}</span>
                    <span className="access-email">{row.email}</span>
                  </div>
                  <div className="access-actions">
                    <select
                      value={row.role}
                      disabled={!isAdminOfCurrentBranch || locked}
                      onChange={(e) => handleRoleChange(row, e.target.value as AccessRole)}
                      className="role-select"
                      aria-label={`Rol de ${row.email}`}
                    >
                      {ROLE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    {isAdminOfCurrentBranch && (
                      <button
                        onClick={() => setRowPendingDelete(row)}
                        className="btn-small btn-danger"
                        disabled={locked}
                      >
                        Quitar
                      </button>
                    )}
                  </div>
                  {locked && (
                    <p className="locked-hint">
                      Es el único administrador de esta sucursal — no se puede quitar ni cambiar su
                      rol hasta que haya otro administrador.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {rowPendingDelete && (
        <ConfirmModal
          message={`¿Quitar el acceso de ${rowPendingDelete.email} a esta sucursal?`}
          confirmLabel="Quitar"
          onConfirm={handleRemoveConfirmed}
          onCancel={() => setRowPendingDelete(null)}
        />
      )}

      <style>{styles}</style>
    </div>
  );
}

const styles = `
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

  .section {
    margin-bottom: 20px;
  }

  .section-title {
    font-size: 15px;
    font-weight: 700;
    margin-bottom: 4px;
  }

  .form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .input {
    width: 100%;
    padding: 14px 16px;
    border: 1px solid var(--border);
    border-radius: 8px;
    font-size: 16px;
    background: var(--surface);
    color: var(--text-primary);
  }

  .input:focus {
    outline: none;
    border-color: var(--accent);
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
    opacity: 0.5;
    cursor: not-allowed;
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

  .notice-text {
    color: var(--text-secondary);
    font-size: 14px;
    text-align: center;
    padding: 12px;
    background: var(--surface-elevated);
    border-radius: 8px;
  }

  .access-list {
    list-style: none;
  }

  .access-item {
    padding: 16px;
    background: var(--surface-elevated);
    border-radius: 12px;
    margin-bottom: 12px;
  }

  .access-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-bottom: 12px;
  }

  .access-name {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .access-email {
    font-size: 13px;
    color: var(--text-secondary);
  }

  .access-actions {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }

  .role-select {
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 13px;
    background: var(--surface);
    color: var(--text-primary);
    min-height: 44px;
  }

  .role-select:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .locked-hint {
    margin-top: 8px;
    font-size: 12px;
    color: var(--text-secondary);
    font-style: italic;
  }
`;
