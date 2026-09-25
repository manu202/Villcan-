// M-4: real column for the cash/bank expense split (movements.expense_source),
// backfilled from the pre-existing `comment` tag convention
// (MovementForm.buildFinalComment / isBankTagged, see src/lib/cashBalance.ts).
//
// Requires a running local stack (`npx supabase start`) and its LOCAL dev
// service-role key in .env.test.local -- see rls-authorization.test.ts's
// header for the exact setup. Run in isolation with: npm run test:integration

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { computeCashBalance, type CashBalanceMovement } from '@/lib/cashBalance';

const SUPABASE_URL = process.env.SUPABASE_LOCAL_URL ?? 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY = process.env.SUPABASE_LOCAL_SECRET_KEY;

if (!SERVICE_ROLE_KEY) {
  throw new Error(
    'SUPABASE_LOCAL_SECRET_KEY is not set. Run `npx supabase start` and set it in ' +
      '.env.test.local, then run this suite with `npm run test:integration`.'
  );
}

async function assertLocalStackReachable() {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`status ${res.status}`);
  } catch (err) {
    throw new Error(
      `Local Supabase stack is not reachable at ${SUPABASE_URL}. Run "supabase start" first. ` +
        `Cause: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const RUN_ID = Date.now().toString(36);
const admin = adminClient();

describe('M-4: movements.expense_source column + backfill', () => {
  let branchId: string;
  let userId: string;
  const createdMovementIds: string[] = [];

  beforeAll(async () => {
    await assertLocalStackReachable();

    const email = `m4-test-${RUN_ID}@example.com`;
    const { data: userData, error: userErr } = await admin.auth.admin.createUser({
      email,
      password: 'Test-Passw0rd!',
      email_confirm: true,
    });
    if (userErr || !userData.user) throw new Error(`createUser failed: ${userErr?.message}`);
    userId = userData.user.id;

    const { error: profileErr } = await admin
      .from('profiles')
      .insert({ id: userId, email, full_name: 'M4 Test' });
    if (profileErr) throw new Error(`profile insert failed: ${profileErr.message}`);

    const { data: branch, error: branchErr } = await admin
      .from('branches')
      .insert({ name: `M4 Test Branch ${RUN_ID}` })
      .select('id')
      .single();
    if (branchErr || !branch) throw new Error(`branch insert failed: ${branchErr?.message}`);
    branchId = branch.id;

    const { error: ubaErr } = await admin
      .from('user_branch_access')
      .insert({ user_id: userId, branch_id: branchId, role: 'admin' });
    if (ubaErr) throw new Error(`user_branch_access insert failed: ${ubaErr.message}`);
  }, 30000);

  afterAll(async () => {
    if (process.env.SKIP_CLEANUP) return;
    if (createdMovementIds.length > 0) {
      await admin.from('movements').delete().in('id', createdMovementIds);
    }
    if (branchId) await admin.from('branches').delete().eq('id', branchId);
    if (userId) await admin.auth.admin.deleteUser(userId).catch(() => undefined);
  }, 30000);

  async function insertMovement(row: {
    type: 'gasto' | 'servicio';
    expense?: number;
    income?: number;
    payment_method?: string | null;
    comment?: string | null;
    expense_source?: string | null;
  }) {
    const { data, error } = await admin
      .from('movements')
      .insert({
        type: row.type,
        expense: row.expense ?? 0,
        income: row.income ?? 0,
        payment_method: row.payment_method ?? null,
        comment: row.comment ?? null,
        expense_source: row.expense_source ?? null,
        user_id: userId,
        branch_id: branchId,
      })
      .select('id')
      .single();
    if (error || !data) throw new Error(`movement insert failed: ${error?.message}`);
    createdMovementIds.push(data.id);
    return data.id as string;
  }

  async function runBackfill() {
    const { error } = await admin.rpc('_backfill_movements_expense_source');
    if (error) throw new Error(`backfill RPC failed: ${error.message}`);
  }

  async function fetchExpenseSource(id: string): Promise<string | null> {
    const { data, error } = await admin
      .from('movements')
      .select('expense_source')
      .eq('id', id)
      .single();
    if (error || !data) throw new Error(`fetch failed: ${error?.message}`);
    return data.expense_source;
  }

  describe('backfill classification', () => {
    it('classifies an existing [Cta Bancaria]-tagged gasto row as cta_bancaria', async () => {
      const id = await insertMovement({
        type: 'gasto',
        expense: 40000,
        comment: 'Pago proveedor [Cta Bancaria]',
      });

      await runBackfill();

      expect(await fetchExpenseSource(id)).toBe('cta_bancaria');
    });

    it('classifies an existing [Caja]-tagged gasto row as caja', async () => {
      const id = await insertMovement({
        type: 'gasto',
        expense: 15000,
        comment: 'Insumos [Caja]',
      });

      await runBackfill();

      expect(await fetchExpenseSource(id)).toBe('caja');
    });

    it('classifies an existing untagged gasto row (no fuente selected historically) as caja', async () => {
      const id = await insertMovement({
        type: 'gasto',
        expense: 5000,
        comment: 'Compra insumos',
      });

      await runBackfill();

      expect(await fetchExpenseSource(id)).toBe('caja');
    });

    it('does not overwrite a row that already has expense_source set (idempotent)', async () => {
      // Simulates a row the (not-yet-wired) UI already wrote the column for
      // directly, with no comment tag at all -- the backfill must never
      // clobber an explicitly-set value based on a stale/absent comment.
      const id = await insertMovement({
        type: 'gasto',
        expense: 8000,
        comment: 'Sin tag',
        expense_source: 'cta_bancaria',
      });

      await runBackfill();

      expect(await fetchExpenseSource(id)).toBe('cta_bancaria');
    });

    it('never sets expense_source on a non-gasto row, regardless of comment content', async () => {
      const id = await insertMovement({
        type: 'servicio',
        income: 20000,
        payment_method: 'efectivo',
      });

      await runBackfill();

      expect(await fetchExpenseSource(id)).toBeNull();
    });

    it('rejects a direct attempt to set expense_source on a non-gasto row (scope CHECK)', async () => {
      const { error } = await admin.from('movements').insert({
        type: 'servicio',
        income: 10000,
        payment_method: 'efectivo',
        expense_source: 'caja',
        user_id: userId,
        branch_id: branchId,
      });

      expect(error).not.toBeNull();
    });
  });

  describe('balance parity: old (comment-tagged, backfilled) vs new (column-set) rows', () => {
    it('a backfilled comment-tagged row and a directly column-set row produce identical balances', async () => {
      // "Old" row: written the way the current (unwired) UI still writes
      // gastos today -- tag in the comment, column unset until backfilled.
      const oldRowId = await insertMovement({
        type: 'gasto',
        expense: 30000,
        comment: 'Alquiler [Cta Bancaria]',
      });
      await runBackfill();
      expect(await fetchExpenseSource(oldRowId)).toBe('cta_bancaria');

      // "New" row: as if a future wired UI wrote the column directly, no
      // reliance on the comment tag at all.
      await insertMovement({
        type: 'gasto',
        expense: 30000,
        comment: null,
        expense_source: 'cta_bancaria',
      });

      const { data: rows, error } = await admin
        .from('movements')
        .select('type, income, expense, payment_method, comment, expense_source')
        .eq('branch_id', branchId)
        .in('id', createdMovementIds);
      if (error || !rows) throw new Error(`fetch failed: ${error?.message}`);

      const movements: CashBalanceMovement[] = rows.map((m) => ({
        type: m.type,
        income: m.income || 0,
        expense: m.expense || 0,
        payment_method: m.payment_method,
        comment: m.comment,
        expense_source: m.expense_source as 'caja' | 'cta_bancaria' | null,
      }));

      const result = computeCashBalance(movements);

      // Every gasto inserted in this describe block (and the earlier
      // classification block, same branch's createdMovementIds so far) is
      // bank-tagged (cta_bancaria) or plain-caja per the classification
      // tests above -- none should reduce `efectivo` except the caja ones.
      // Rather than hand-recompute the whole accumulated fixture set here
      // (order-dependent and brittle), assert the one thing this test
      // exists to prove: the two 30000 cta_bancaria gastos (one backfilled
      // from a tag, one column-set directly) are classified IDENTICALLY --
      // neither reduces efectivo, both reduce global by exactly 30000 each,
      // by comparing a balance computed with only those two rows in
      // isolation against the hand-computed expected numbers.
      const isolated = computeCashBalance([
        movements.find((m) => m.expense === 30000 && m.comment === 'Alquiler [Cta Bancaria]')!,
        movements.find((m) => m.expense === 30000 && m.comment === null)!,
      ]);
      expect(isolated.efectivo).toBe(0);
      expect(isolated.global).toBe(-60000);
      void result;
    });

    it('a directly-inserted caja row and a backfilled untagged row both reduce efectivo identically', async () => {
      const backfilledId = await insertMovement({
        type: 'gasto',
        expense: 7000,
        comment: 'Sin fuente explicita',
      });
      await runBackfill();
      expect(await fetchExpenseSource(backfilledId)).toBe('caja');

      const directId = await insertMovement({
        type: 'gasto',
        expense: 7000,
        comment: null,
        expense_source: 'caja',
      });

      const { data: rows, error } = await admin
        .from('movements')
        .select('type, income, expense, payment_method, comment, expense_source')
        .in('id', [backfilledId, directId]);
      if (error || !rows) throw new Error(`fetch failed: ${error?.message}`);

      const movements: CashBalanceMovement[] = rows.map((m) => ({
        type: m.type,
        income: m.income || 0,
        expense: m.expense || 0,
        payment_method: m.payment_method,
        comment: m.comment,
        expense_source: m.expense_source as 'caja' | 'cta_bancaria' | null,
      }));

      const result = computeCashBalance(movements);
      // Both are caja: both reduce efectivo (and therefore global) by 7000 each.
      expect(result.efectivo).toBe(-14000);
      expect(result.global).toBe(-14000);
    });
  });
});
