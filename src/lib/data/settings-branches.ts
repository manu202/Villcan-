import { createClient } from '@/lib/supabase/client';
import type { BusinessVertical } from '@/types';

/**
 * Storefront-related columns for every branch, used by BranchesPage to
 * build its per-branch storefront preview (whatsapp/slug/enabled state).
 */
export async function listBranchStorefrontData() {
  const supabase = createClient();
  return supabase
    .from('branches')
    .select('id, whatsapp_number, slug, storefront_enabled');
}

/** BranchesPage's edit-branch form submit: updates the branch's core fields. */
export async function updateBranch(
  branchId: string,
  payload: {
    name: string;
    address: string;
    vertical: BusinessVertical;
    whatsapp_number: string | null;
  }
) {
  const supabase = createClient();
  return supabase.from('branches').update(payload).eq('id', branchId);
}

/**
 * BranchesPage's new-branch form submit. Atomic bootstrap: creates the
 * branch and the first admin user_branch_access row server-side (SECURITY
 * DEFINER RPC), so the client never needs (and no longer has) a direct
 * branch INSERT policy.
 */
export async function createBranchWithAdmin(params: {
  p_name: string;
  p_address: string;
  p_vertical: BusinessVertical;
  p_whatsapp: string | null;
}) {
  const supabase = createClient();
  return supabase.rpc('create_branch_with_admin', params);
}

/** BranchesPage's delete-branch confirmation. */
export async function deleteBranch(branchId: string) {
  const supabase = createClient();
  return supabase.from('branches').delete().eq('id', branchId);
}
