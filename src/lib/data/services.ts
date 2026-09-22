import { createClient } from '@/lib/supabase/client';

/**
 * Active + available services for a branch (branch-specific + global,
 * branch_id IS NULL), ordered by name.
 *
 * Call sites select different column sets on the exact same filters/order
 * (orders/[id]/page.tsx and orders/new/page.tsx select '*'; MovementForm
 * selects the narrower 'id, name, price') — `columns` preserves that
 * existing difference instead of forcing one shape on all callers.
 */
export async function listActiveServicesForBranch(branchId: string, columns: string = '*') {
  const supabase = createClient();
  return supabase
    .from('services')
    .select(columns)
    .eq('is_active', true)
    .eq('is_available', true)
    .or(`branch_id.eq.${branchId},branch_id.is.null`)
    .order('name');
}
