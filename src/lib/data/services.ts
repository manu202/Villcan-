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

/**
 * Active services for ServicesPage's own catalog list — NOT the same query
 * as `listActiveServicesForBranch` above (no `is_available` filter here,
 * since the catalog admin page shows unavailable services too so staff can
 * toggle them back on). Preserves the original branching: when no branch is
 * selected yet, only global (branch_id IS NULL) services are shown, instead
 * of the `.or()` filter used once a branch is selected.
 */
export async function listServicesForCatalog(branchId: string | null) {
  const supabase = createClient();
  let query = supabase
    .from('services')
    .select('id, name, price, is_active, is_available, branch_id')
    .eq('is_active', true)
    .order('name');

  if (branchId) {
    query = query.or(`branch_id.eq.${branchId},branch_id.is.null`);
  } else {
    query = query.is('branch_id', null);
  }

  return query;
}

/** ServicesPage's availability toggle (optimistic UI updates local state
 * first, then persists). */
export async function updateServiceAvailability(serviceId: string, isAvailable: boolean) {
  const supabase = createClient();
  return supabase.from('services').update({ is_available: isAvailable }).eq('id', serviceId);
}

/**
 * Single service by id. Used by both orders/[id]/page.tsx (narrower column
 * set: id, name, price, cost, is_active, created_at, branch_id) and
 * ServiceEditSheet (edit-form column set: id, name, price, cost,
 * description, image_url, category, is_available, branch_id) — the
 * `columns` param preserves that existing difference, same as
 * `listActiveServicesForBranch` above.
 */
export async function getServiceById(serviceId: string, columns: string = '*') {
  const supabase = createClient();
  return supabase
    .from('services')
    .select<string, Service>(columns)
    .eq('id', serviceId)
    .single();
}

/**
 * Recent (capped at 20) "servicio"-type movements for a service, newest
 * first, used by ServiceDetailPage's "Ventas recientes" list.
 */
export async function listRecentMovementsForService(serviceId: string) {
  const supabase = createClient();
  return supabase
    .from('movements')
    .select(`
      id, contact:contacts(full_name), payment_method, amount_charged,
      income, expense, created_at
    `)
    .eq('service_id', serviceId)
    .eq('type', 'servicio')
    .order('created_at', { ascending: false })
    .limit(20);
}

/** ServiceEditSheet update path (edit). */
export async function updateService(
  serviceId: string,
  payload: {
    name: string;
    price: number;
    cost: number;
    description: string | null;
    image_url: string | null;
    category: string | null;
    is_available: boolean;
    branch_id: string | null;
  }
) {
  const supabase = createClient();
  return supabase.from('services').update(payload).eq('id', serviceId);
}

/** ServiceForm create path (new service). */
export async function createService(payload: {
  name: string;
  price: number;
  cost: number;
  is_active: boolean;
  branch_id: string | null | undefined;
  description: string | null;
  image_url: string | null;
  category: string | null;
  is_available: boolean;
}) {
  const supabase = createClient();
  return supabase.from('services').insert(payload).select().single();
}

/**
 * Uploads a service image to the `service-images` storage bucket. Used by
 * both ServiceForm (create) and ServiceEditSheet (edit) — `path` is built
 * by the caller (branch-scoped, so storage.objects RLS can check the first
 * path segment against the uploader's branch access).
 */
export async function uploadServiceImage(path: string, file: File) {
  const supabase = createClient();
  return supabase.storage.from('service-images').upload(path, file);
}

/**
 * Public URL for a just-uploaded service image. Synchronous (matches the
 * underlying supabase-js `getPublicUrl` call, which returns immediately —
 * not a network request), so this is intentionally not `async`.
 */
export function getServiceImagePublicUrl(path: string) {
  const supabase = createClient();
  return supabase.storage.from('service-images').getPublicUrl(path);
}
