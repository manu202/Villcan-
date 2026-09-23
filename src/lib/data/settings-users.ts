import { createClient } from '@/lib/supabase/client';
import type { UserBranchAccess } from '@/types';

type AccessRole = UserBranchAccess['role'];

/**
 * UsersPage's loadAccess: lists every user_branch_access row for the given
 * branch, joined with the profile's email/full_name.
 */
export async function listBranchAccessWithProfiles(branchId: string) {
  const supabase = createClient();
  return supabase
    .from('user_branch_access')
    .select('user_id, role, profiles(email, full_name)')
    .eq('branch_id', branchId);
}

/** UsersPage's handleRoleChange: updates a user's role within one branch. */
export async function updateBranchAccessRole(
  userId: string,
  branchId: string,
  role: AccessRole
) {
  const supabase = createClient();
  return supabase
    .from('user_branch_access')
    .update({ role })
    .eq('user_id', userId)
    .eq('branch_id', branchId);
}

/** UsersPage's handleRemoveConfirmed: removes a user's access to one branch. */
export async function deleteBranchAccess(userId: string, branchId: string) {
  const supabase = createClient();
  return supabase
    .from('user_branch_access')
    .delete()
    .eq('user_id', userId)
    .eq('branch_id', branchId);
}
