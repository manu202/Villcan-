import { createClient } from '@/lib/supabase/client';
import type { BranchWithRole } from '@/types';

interface UserBranchAccessRow {
  role: string;
  branch: {
    id: string;
    name: string;
    address: string | null;
    is_active: boolean;
    created_at: string;
  } | null;
}

export async function getUserBranches(): Promise<BranchWithRole[]> {
  const supabase = createClient();

  // First get the user synchronously
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('user_branch_access')
    .select(`
      role,
      branch:branches (
        id,
        name,
        address,
        is_active,
        created_at
      )
    `)
    .eq('user_id', user.id);

  if (error || !data) return [];

  return (data as unknown as UserBranchAccessRow[])
    .filter((item) => item.branch !== null)
    .map((item) => ({
      ...item.branch!,
      user_role: item.role,
    })) as BranchWithRole[];
}

export function getCurrentBranchId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('current_branch_id');
}

export function setCurrentBranchId(branchId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('current_branch_id', branchId);
}
