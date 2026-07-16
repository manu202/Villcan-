'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getUser, signOut } from '@/lib/auth';
import { createClient } from '@/lib/supabase/client';

export function AuthButton() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkUser = async () => {
      const user = await getUser();
      setUserEmail(user?.email || null);
      setIsLoading(false);
    };
    checkUser();

    // Subscribe to auth state changes
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUserEmail(session?.user?.email || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await signOut();
    window.location.href = '/login';
  };

  if (isLoading) {
    return (
      <div className="auth-loading">
        <span className="loading-dot">•</span>
        <style>{`
          .auth-loading {
            padding: 8px 0;
          }
          .loading-dot {
            font-size: 14px;
            color: var(--text-muted);
            animation: pulse 1s ease-in-out infinite;
          }
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
          }
        `}</style>
      </div>
    );
  }

  if (!userEmail) {
    return (
      <Link href="/login" className="auth-link">
        Ingresar
        <style>{`
          .auth-link {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 10px 16px;
            background: var(--accent);
            color: var(--accent-foreground);
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            text-decoration: none;
            transition: opacity 0.15s ease;
          }
          .auth-link:hover {
            opacity: 0.85;
          }
        `}</style>
      </Link>
    );
  }

  return (
    <div className="auth-info">
      <span className="user-email">{userEmail}</span>
      <button onClick={handleSignOut} className="signout-btn">
        Cerrar sesión
      </button>
      <style>{`
        .auth-info {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .user-email {
          font-size: 14px;
          font-weight: 500;
          color: var(--text-secondary);
          word-break: break-all;
        }
        .signout-btn {
          padding: 10px 16px;
          background: var(--surface);
          color: var(--text-primary);
          border: 1px solid var(--border);
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: border-color 0.15s ease;
        }
        .signout-btn:hover {
          border-color: var(--accent-hover);
        }
      `}</style>
    </div>
  );
}