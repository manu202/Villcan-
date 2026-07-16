'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signInWithPassword } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const { error } = await signInWithPassword(email, password);

    if (error) {
      setError(error.message);
      setIsLoading(false);
      return;
    }

    router.push('/');
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <header className="login-header">
          <h1 className="login-title">VILLCAN</h1>
          <p className="login-subtitle">Ingresá a tu cuenta</p>
        </header>

        <form onSubmit={handleSubmit} className="login-form">
          {error && <div className="error-message">{error}</div>}

          <div className="form-group">
            <label htmlFor="email" className="form-label">Email</label>
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

          <div className="form-group">
            <label htmlFor="password" className="form-label">Contraseña</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              className="input"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="btn-primary btn-full"
          >
            {isLoading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>

        <div className="login-footer">
          <Link href="/" className="back-link">← Volver al inicio</Link>
        </div>
      </div>

      <style>{`
        .login-page {
          height: 100dvh;
          height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          background: var(--surface);
          overflow: hidden;
        }

        .login-container {
          width: 100%;
          max-width: 400px;
        }

        .login-header {
          text-align: center;
          margin-bottom: 32px;
        }

        .login-title {
          font-size: 24px;
          font-weight: 700;
          letter-spacing: 0.1em;
          margin-bottom: 8px;
        }

        .login-subtitle {
          font-size: 15px;
          color: var(--text-secondary);
        }

        .login-form {
          background: var(--surface-elevated);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 20px;
        }

        .error-message {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 12px 16px;
          margin-bottom: 16px;
          font-size: 14px;
          color: var(--text-primary);
        }

        .form-group {
          margin-bottom: 20px;
        }

        .form-label {
          display: block;
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-secondary);
          margin-bottom: 8px;
        }

        .btn-primary {
          margin-top: 8px;
        }

        .login-footer {
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