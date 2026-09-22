import { createClient } from '@/lib/supabase/client';
import type { MovementType } from '@/types';

const MOVEMENT_DETAIL_COLUMNS = `
  id, type, amount_charged, income, expense, payment_method, comment, created_at,
  contact:contacts(id, full_name),
  service:services(id, name)
`;

export interface CreateMovementParams {
  type: MovementType;
  income: number;
  expense: number;
  comment: string | null;
  user_id: string;
  branch_id: string;
  created_at: string;
}

/**
 * Insert a movement (gasto/apertura/cierre types — the Venta/sale type goes
 * through `createManualOrder` instead). `.select('id').single()` matches the
 * original inline insert exactly.
 */
export async function createMovement(params: CreateMovementParams) {
  const supabase = createClient();
  return supabase.from('movements').insert(params).select('id').single();
}

/**
 * Movements for a branch within a date range (start inclusive, end
 * exclusive), newest first, capped at 100 — the movements list query.
 */
export async function listMovementsForBranch(branchId: string, start: string, end: string) {
  const supabase = createClient();
  return supabase
    .from('movements')
    .select(MOVEMENT_DETAIL_COLUMNS)
    .gte('created_at', start)
    .lt('created_at', end)
    .order('created_at', { ascending: false })
    .limit(100)
    .eq('branch_id', branchId);
}

/** Single movement detail query, joined with contact/service. */
export async function getMovement(movementId: string) {
  const supabase = createClient();
  return supabase
    .from('movements')
    .select(MOVEMENT_DETAIL_COLUMNS)
    .eq('id', movementId)
    .single();
}
