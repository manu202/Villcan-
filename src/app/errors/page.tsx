'use client';

import { useEffect, useState } from 'react';
import { useBranch } from '@/contexts/BranchContext';
import { createClient } from '@/lib/supabase/client';
import { formatDate, formatTime } from '@/lib/utils';
import { Spinner } from '@/components/Spinner';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { AlertOctagon } from 'lucide-react';
import type { ClientError } from '@/types';

export default function ClientErrorsPage() {
  const { branches } = useBranch();
  const [errors, setErrors] = useState<ClientError[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const isAdminAnywhere = branches.some((b) => b.user_role === 'admin');

  useEffect(() => {
    // Non-admins never reach the loading UI — the component returns the
    // restricted view below before rendering it, regardless of `loading`.
    if (!isAdminAnywhere) return;

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(false);
      const supabase = createClient();
      const { data, error: fetchError } = await supabase
        .from('client_errors')
        .select('id, message, stack, url, user_agent, user_id, branch_id, created_at')
        .order('created_at', { ascending: false })
        .limit(100);

      if (cancelled) return;
      if (fetchError) {
        setError(true);
      } else if (data) {
        setErrors(data as ClientError[]);
      }
      setLoading(false);
    };
    load();

    return () => {
      cancelled = true;
    };
  }, [isAdminAnywhere, reloadToken]);

  if (!isAdminAnywhere) {
    return (
      <div className="page">
        <header className="page-header">
          <h1 className="page-title">Errores de usuarios</h1>
        </header>
        <div className="empty-state">
          <p>Acceso restringido</p>
          <p className="page-subtitle">Solo un administrador puede ver esta página.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-title">Errores de usuarios</h1>
        <p className="page-subtitle">Errores reales capturados del navegador de cualquier usuario</p>
      </header>

      <section className="section">
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
            <Spinner size={36} color="black" />
          </div>
        ) : error ? (
          <ErrorState onRetry={() => setReloadToken((t) => t + 1)} />
        ) : errors.length === 0 ? (
          <EmptyState
            icon={AlertOctagon}
            title="Sin errores registrados"
            message="Todavía no se capturó ningún error del lado del cliente"
          />
        ) : (
          <ul className="error-list">
            {errors.map((e) => (
              <li key={e.id} className="error-item">
                <button
                  type="button"
                  className="error-summary"
                  onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}
                >
                  <span className="error-message">{e.message}</span>
                  <span className="error-meta">
                    {formatDate(e.created_at)} {formatTime(e.created_at)}
                  </span>
                </button>
                {expandedId === e.id && (
                  <div className="error-details">
                    {e.url && <p className="error-detail-row"><strong>URL:</strong> {e.url}</p>}
                    {e.user_agent && <p className="error-detail-row"><strong>Navegador:</strong> {e.user_agent}</p>}
                    {e.stack && <pre className="error-stack">{e.stack}</pre>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <style>{`
        .page {
          max-width: 480px;
          margin: 0 auto;
        }

        .page-title {
          font-size: 24px;
          font-weight: 700;
        }

        .page-subtitle {
          font-size: 13px;
          color: var(--text-secondary);
          margin-top: 4px;
        }

        .empty-state {
          text-align: center;
          padding: 48px 24px;
          color: var(--text-secondary);
        }

        .error-list {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .error-item {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          overflow: hidden;
        }

        .error-summary {
          width: 100%;
          text-align: left;
          padding: 14px 16px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          background: none;
          border: none;
          cursor: pointer;
        }

        .error-message {
          font-size: 14px;
          font-weight: 600;
          color: var(--danger);
          word-break: break-word;
        }

        .error-meta {
          font-size: 12px;
          color: var(--text-muted);
        }

        .error-details {
          padding: 0 16px 14px;
          border-top: 1px solid var(--border);
        }

        .error-detail-row {
          font-size: 12px;
          color: var(--text-secondary);
          margin-top: 8px;
          word-break: break-word;
        }

        .error-stack {
          margin-top: 8px;
          padding: 10px;
          background: var(--surface-elevated);
          border-radius: 6px;
          font-size: 11px;
          color: var(--text-secondary);
          white-space: pre-wrap;
          word-break: break-word;
          max-height: 240px;
          overflow-y: auto;
        }
      `}</style>
    </div>
  );
}
