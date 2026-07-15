'use client';

import { useToast } from '@/hooks/useToast';
import { MovementForm } from '@/components/MovementForm';

export default function NewMovementPage() {
  const { showToast } = useToast();
  return <MovementForm showToast={showToast} />;
}