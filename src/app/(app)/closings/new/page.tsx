'use client';

import { useRouter } from 'next/navigation';
import { useBranch } from '@/contexts/BranchContext';
import { AppSheet } from '@/components/AppSheet';
import { ClosingWizard } from '@/components/ClosingWizard';

export default function NewClosingPage() {
  const router = useRouter();
  const { currentBranch } = useBranch();

  const isAdmin = currentBranch?.user_role === 'admin';

  const handleClose = () => router.back();
  const handleSaved = () => router.push('/closings');

  if (!isAdmin) {
    return (
      <div className="page">
        <div className="empty-state">
          <p>Acceso restringido</p>
          <p className="page-subtitle">Solo un administrador puede cerrar la caja.</p>
        </div>
        <style>{`
          .page { max-width: 480px; margin: 0 auto; padding: 24px 16px; }
          .empty-state { text-align: center; padding: 48px 24px; color: var(--text-secondary); }
          .page-subtitle { font-size: 14px; color: var(--text-secondary); margin-top: 8px; }
        `}</style>
      </div>
    );
  }

  return (
    <AppSheet
      open
      onOpenChange={(open) => { if (!open) handleClose(); }}
      title="Cerrar Caja"
    >
      <ClosingWizard onClose={handleClose} onSaved={handleSaved} />
    </AppSheet>
  );
}
