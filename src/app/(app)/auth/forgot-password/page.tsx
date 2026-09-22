'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type UIState = 'form' | 'sending' | 'sent';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [uiState, setUiState] = useState<UIState>('form');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setUiState('sending');

    const supabase = createClient();

    try {
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/set-password`,
      });
    } catch {
      // A thrown error here is a client/network problem, not a signal about
      // whether the email exists — show it plainly instead of the generic
      // success message.
      setError('No pudimos procesar tu pedido. Intentá de nuevo.');
      setUiState('form');
      return;
    }

    // Always show the same generic message, whether or not the email is
    // registered, so this endpoint can't be used to enumerate accounts.
    setUiState('sent');
  };

  return (
    <div className="fp-page">
      <div className="fp-container">
        <header className="fp-header">
          <h1 className="fp-title">VILLCAN</h1>
          <p className="fp-subtitle">Recuperar contraseña</p>
        </header>

        {uiState === 'sent' ? (
          <div className="fp-form">
            <p className="fp-success">
              Si ese email existe en nuestro sistema, te enviamos un enlace para restablecer tu contraseña.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="fp-form">
            {error && <div className="fp-error-box">{error}</div>}

            <div className="fp-group">
              <label htmlFor="email" className="fp-label">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                required
                autoComplete="email"
                className="input"
              />
            </div>

            <button
              type="submit"
              disabled={uiState === 'sending'}
              className="btn-primary btn-full"
            >
              {uiState === 'sending' ? 'Enviando...' : 'Enviar enlace'}
            </button>
          </form>
        )}

        <div className="fp-footer">
          <Link href="/login" className="back-link">← Volver a ingresar</Link>
        </div>
      </div>

      <style>{`
        .fp-page {
          height: 100dvh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          background: var(--surface);
        }
        .fp-container {
          width: 100%;
          max-width: 400px;
        }
        .fp-header {
          text-align: center;
          margin-bottom: 32px;
        }
        .fp-title {
          font-size: 24px;
          font-weight: 700;
          letter-spacing: 0.1em;
          margin-bottom: 8px;
        }
        .fp-subtitle {
          font-size: 15px;
          color: var(--text-secondary);
        }
        .fp-form {
          background: var(--surface-elevated);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 20px;
        }
        .fp-error-box {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 12px 16px;
          margin-bottom: 16px;
          font-size: 14px;
          color: var(--text-primary);
        }
        .fp-success {
          font-size: 14px;
          color: var(--text-primary);
          text-align: center;
          margin: 0;
        }
        .fp-group {
          margin-bottom: 20px;
        }
        .fp-label {
          display: block;
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-secondary);
          margin-bottom: 8px;
        }
        .fp-footer {
          margin-top: 24px;
          text-align: center;
        }
        .back-link {
          font-size: 14px;
          color: var(--text-secondary);
          text-decoration: none;
        }
        .back-link:hover {
          color: var(--text-primary);
        }
      `}</style>
    </div>
  );
}
