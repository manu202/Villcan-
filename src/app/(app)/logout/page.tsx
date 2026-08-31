'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from '@/lib/auth';

export default function LogoutPage() {
  const router = useRouter();
  useEffect(() => {
    signOut()
      .then(() => router.push('/login'))
      .catch(() => router.push('/login'));
  }, [router]);
  return (
    <div className="logout-page">
      <p className="logout-text">Cerrando sesión...</p>
      <style>{`
        .logout-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .logout-text {
          font-size: 15px;
          color: var(--text-secondary);
        }
      `}</style>
    </div>
  );
}