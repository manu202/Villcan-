import { createClient } from '@/lib/supabase/client';
import type { Service } from '@/types';

/**
 * Active + available services for a branch (branch-specific + global,
 * branch_id IS NULL), ordered by name.
 *
 * Call sites select different column sets on the exact same filters/order
 * (orders/[id]/page.tsx and orders/new/page.tsx select '*'; MovementForm
 * selects the narrower 'id, name, price') — `columns` preserves that
 * existing difference instead of forcing one shape on all callers.
 *
 * supabase-js infers .select()'s result type by parsing the column string
 * as a TypeScript string LITERAL — passing a `string`-typed variable
 * (as `columns` is here, since it varies per caller) defeats that inference
 * and the client falls back to a `GenericStringError` result type. That
 * compiled locally under `tsc --noEmit`'s incremental cache but failed
 * Next.js's clean production build on Vercel. The explicit `<string, Service>`
 * type arguments are supabase-js's documented workaround for exactly this
 * case (a dynamic, non-literal select string) — callers still get a
 * properly typed `Service[]` result regardless of which column subset they
 * actually pass.
 */
export async function listActiveServicesForBranch(branchId: string, columns: string = '*') {
  const supabase = createClient();
  return supabase
    .from('services')
    .select<string, Service>(columns)
    .eq('is_active', true)
    .eq('is_available', true)
    .or(`branch_id.eq.${branchId},branch_id.is.null`)
    .order('name');
}
