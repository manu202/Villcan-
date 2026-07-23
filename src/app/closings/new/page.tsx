'use client';

import Link from 'next/link';
import { useBranch } from '@/contexts/BranchContext';
import { ClosingForm } from '@/components/ClosingForm';

export default function NewClosingPage() {
  const { currentBranch } = useBranch();

  const isAdmin = currentBranch?.user_role === 'admin';

  if (!isAdmin) {
    return (
      <div className="page">
        <header className="page-header">
          <Link href="/closings" className="back-link">← Cierres</Link>
          <h1 className="page-title">Cerrar Caja</h1>
        </header>
        <div className="empty-state">
          <p>Acceso restringido</p>
          <p className="page-subtitle">Solo un administrador puede cerrar la caja.</p>
        </div>

        <style>{`
          .page {
            max-width: 480px;
            margin: 0 auto;
          }

          .back-link {
            display: inline-block;
            font-size: 14px;
            color: var(--text-secondary);
            text-decoration: none;
            margin-bottom: 8px;
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

  return <ClosingForm />;
}
