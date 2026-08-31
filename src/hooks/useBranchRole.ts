'use client';

import { useBranch } from '@/contexts/BranchContext';
import type { BranchWithRole } from '@/types';

export type BranchRole = BranchWithRole['user_role'] | null;

interface UseBranchRoleResult {
  role: BranchRole;
  canWrite: boolean;
}

/**
 * UI-side mirror of the DB-level RLS enforcement (bug #6): a `viewer` can
 * read but never write. This hook only disables controls for UX — the real
 * guarantee is the RLS policy on movements/services (see
 * supabase/migrations/0002_user_fixes.sql), since a viewer could otherwise
 * call the Supabase client directly and bypass any UI-only restriction.
 */
export function useBranchRole(): UseBranchRoleResult {
  const { currentBranch } = useBranch();
  const role: BranchRole = currentBranch?.user_role ?? null;
  const canWrite = role !== null && role !== 'viewer';

  return { role, canWrite };
}
