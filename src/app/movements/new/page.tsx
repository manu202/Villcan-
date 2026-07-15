'use client';

import { useToast } from '@/contexts/ToastContext';
import { MovementForm } from '@/components/MovementForm';

export default function NewMovementPage() {
  const { showToast } = useToast();
  return <MovementForm showToast={showToast} />;
}