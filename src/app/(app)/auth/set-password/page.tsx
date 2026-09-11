'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type UIState = 'loading' | 'form' | 'saving' | 'error';

export default function SetPasswordPage() {
  const router = useRouter();
  const [uiState, setUiState] = useState<UIState>('loading');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [serverError, setServerError] = useState('');

  useEffect(() => {
    const supabase = createClient();

    // createBrowserClient automatically detects the #access_token in the hash
    // and fires SIGNED_IN. We only need to listen.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        setUiState('form');
      }
    });

    // Fallback: if session already exists (e.g. page refresh), go to form directly.
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUiState('form');
    });

    return () => subscription.unsubscribe();
  }, []);

  const validate = () => {
    if (password.length < 8) {
      setFieldError('La contraseña debe tener al menos 8 caracteres');
      return false;
    }
    if (password !== confirm) {
      setFieldError('Las contraseñas no coinciden');
      return false;
    }
    setFieldError('');
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setUiState('saving');
    setServerError('');

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setServerError(error.message);
      setUiState('form');
      return;
    }

    router.push('/');
  };

  return (
    <div className="sp-page">
      <div className="sp-container">
        <header className="sp-header">
          <h1 className="sp-title">VILLCAN</h1>
          <p className="sp-subtitle">
            {uiState === 'loading' ? 'Verificando invitación...' : 'Creá tu contraseña'}
          </p>
        </header>

        {uiState === 'loading' && (
          <div className="sp-loading">
            <div className="sp-spinner" />
          </div>
        )}

        {(uiState === 'form' || uiState === 'saving') && (
          <form onSubmit={handleSubmit} className="sp-form">
            {serverError && <div className="sp-error-box">{serverError}</div>}

            <div className="sp-group">
              <label htmlFor="password" className="sp-label">Contraseña</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setFieldError(''); }}
                placeholder="Mínimo 8 caracteres"
                required
                autoComplete="new-password"
                className="input"
              />
            </div>

            <div className="sp-group">
              <label htmlFor="confirm" className="sp-label">Confirmar contraseña</label>
              <input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => { setConfirm(e.target.value); setFieldError(''); }}
                placeholder="Repetí la contraseña"
                required
                autoComplete="new-password"
                className="input"
              />
              {fieldError && <p className="sp-field-error">{fieldError}</p>}
            </div>

            <button
              type="submit"
              disabled={uiState === 'saving'}
              className="btn-primary btn-full"
            >
              {uiState === 'saving' ? 'Guardando...' : 'Activar cuenta'}
            </button>
          </form>
        )}

        {uiState === 'error' && (
          <div className="sp-error-box">
            El enlace de invitación expiró o ya fue utilizado. Pedí un nuevo invite a tu administrador.
          </div>
        )}
      </div>

      <style>{`
        .sp-page {
          height: 100dvh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          background: var(--surface);
        }
        .sp-container {
          width: 100%;
          max-width: 400px;
        }
        .sp-header {
          text-align: center;
          margin-bottom: 32px;
        }
        .sp-title {
          font-size: 24px;
          font-weight: 700;
          letter-spacing: 0.1em;
          margin-bottom: 8px;
        }
        .sp-subtitle {
          font-size: 15px;
          color: var(--text-secondary);
        }
        .sp-loading {
          display: flex;
          justify-content: center;
          padding: 40px 0;
        }
        .sp-spinner {
          width: 32px;
          height: 32px;
          border: 3px solid var(--border);
          border-top-color: var(--accent);
          border-radius: 50%;
          animation: sp-spin 0.7s linear infinite;
        }
        @keyframes sp-spin { to { transform: rotate(360deg); } }
        .sp-form {
          background: var(--surface-elevated);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 20px;
        }
        .sp-error-box {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 12px 16px;
          margin-bottom: 16px;
          font-size: 14px;
          color: var(--text-primary);
        }
        .sp-group {
          margin-bottom: 20px;
        }
        .sp-label {
          display: block;
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-secondary);
          margin-bottom: 8px;
        }
        .sp-field-error {
          margin-top: 6px;
          font-size: 13px;
          color: var(--accent);
        }
      `}</style>
    </div>
  );
}
