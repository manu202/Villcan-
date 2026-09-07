'use client';

import { useRouter } from 'next/navigation';
import { useToast } from '@/contexts/ToastContext';
import { MovementForm } from '@/components/MovementForm';
import { AppSheet } from '@/components/AppSheet';

export default function NewMovementPage() {
  const { showToast } = useToast();
  const router = useRouter();

  return (
    <AppSheet
      open={true}
      onOpenChange={(open) => { if (!open) router.push('/movements'); }}
      title="Nuevo movimiento"
    >
      <MovementForm showToast={showToast} />
    </AppSheet>
  );
}
