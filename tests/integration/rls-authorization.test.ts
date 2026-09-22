// Integration test suite exercising REAL Postgres RLS/RPC behavior against the
// local Supabase stack (http://127.0.0.1:54321). Do NOT point this at
// production.
//
// Requires a running local stack (`npx supabase start`) and its LOCAL dev
// service-role key in the environment — never hardcode it here (GitHub push
// protection will block the commit, and it shouldn't be committed even if it
// wouldn't). Set it in a gitignored `.env.test.local`:
//   SUPABASE_LOCAL_URL=http://127.0.0.1:54321
//   SUPABASE_LOCAL_ANON_KEY=<from `supabase start` output, "Publishable" key>
//   SUPABASE_LOCAL_SECRET_KEY=<from `supabase start` output, "Secret" key>
//
// Run in isolation with: npm run test:integration
//
// Covers the 6 confirmed-broken items fixed by
// supabase/migrations/20260922000000_fix_confirmed_prod_and_local_gaps.sql:
//   1. profiles_select_branch_scoped
//   3. uba_insert_existing_admin + create_branch_with_admin RPC
//   4. branches_insert_authenticated dropped
//   5. update_order role fix + completed/cancelled guard
//   6. orders_update_admin_or_user WITH CHECK + financial-field trigger guard
//   7. movements_update_admin_or_user — closed-period guard
// Plus O-4 (complete_order_payment) and the M-2 status-freeze follow-up.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_LOCAL_URL ?? 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY = process.env.SUPABASE_LOCAL_SECRET_KEY;
const ANON_KEY = process.env.SUPABASE_LOCAL_ANON_KEY;

if (!SERVICE_ROLE_KEY || !ANON_KEY) {
  throw new Error(
    'SUPABASE_LOCAL_SECRET_KEY / SUPABASE_LOCAL_ANON_KEY are not set. ' +
      'Run `npx supabase start`, copy the "Secret"/"Publishable" keys it prints ' +
      'into .env.test.local, and run this suite with ' +
      '`npm run test:integration` (which loads that file).'
  );
}

async function assertLocalStackReachable() {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
  } catch (err) {
    throw new Error(
      `Local Supabase stack is not reachable at ${SUPABASE_URL}. ` +
        `Run "supabase start" before "npm run test:integration". Cause: ${
          err instanceof Error ? err.message : String(err)
        }`
    );
  }
}

function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function signedInClient(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn failed for ${email}: ${error.message}`);
  return client;
}

const PASSWORD = 'Test-Passw0rd!';
const RUN_ID = Date.now().toString(36);

describe('RLS/RPC authorization (real Postgres, local stack)', () => {
  const admin = adminClient();

  let branchX: string; // admin: userA, member: userC (role=user)
  let branchY: string; // admin: userB, no relation to branchX
  let userA: { id: string; email: string; client: SupabaseClient };
  let userB: { id: string; email: string; client: SupabaseClient };
  let userC: { id: string; email: string; client: SupabaseClient };

  const createdUserIds: string[] = [];
  const createdBranchIds: string[] = [];

  async function createTestUser(label: string) {
    const email = `rls-test-${label}-${RUN_ID}@example.com`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error || !data.user) {
      throw new Error(`Failed to create test user ${label}: ${error?.message}`);
    }
    createdUserIds.push(data.user.id);

    // No DB trigger wires auth.users -> public.profiles in this schema
    // (confirmed: no CREATE TRIGGER on auth.users across the migration
    // chain); profile rows are expected to exist for user_branch_access's FK,
    // so the fixture creates one directly via the service-role client.
    const { error: profileErr } = await admin.from('profiles').insert({
      id: data.user.id,
      email,
      full_name: `RLS Test ${label}`,
    });
    if (profileErr) {
      throw new Error(`Failed to seed profile for ${label}: ${profileErr.message}`);
    }

    const client = await signedInClient(email, PASSWORD);
    return { id: data.user.id, email, client };
  }

  beforeAll(async () => {
    await assertLocalStackReachable();

    userA = await createTestUser('a');
    userB = await createTestUser('b');
    userC = await createTestUser('c');

    const { data: bx, error: bxErr } = await admin
      .from('branches')
      .insert({ name: `RLS Test Branch X ${RUN_ID}` })
      .select('id')
      .single();
    if (bxErr || !bx) throw new Error(`Failed to create branchX: ${bxErr?.message}`);
    branchX = bx.id;
    createdBranchIds.push(branchX);

    const { data: by, error: byErr } = await admin
      .from('branches')
      .insert({ name: `RLS Test Branch Y ${RUN_ID}` })
      .select('id')
      .single();
    if (byErr || !by) throw new Error(`Failed to create branchY: ${byErr?.message}`);
    branchY = by.id;
    createdBranchIds.push(branchY);

    const { error: ubaErr } = await admin.from('user_branch_access').insert([
      { user_id: userA.id, branch_id: branchX, role: 'admin' },
      { user_id: userC.id, branch_id: branchX, role: 'user' },
      { user_id: userB.id, branch_id: branchY, role: 'admin' },
    ]);
    if (ubaErr) throw new Error(`Failed to seed user_branch_access: ${ubaErr.message}`);
  }, 30000);

  afterAll(async () => {
    if (process.env.SKIP_CLEANUP) return;
    // Clean up in FK-safe order: orders/order_items/movements/services cascade
    // from branches (ON DELETE CASCADE per baseline FKs); delete branches
    // first, then users, then any stray branches created mid-test (e.g. via
    // create_branch_with_admin).
    if (createdBranchIds.length > 0) {
      await admin.from('branches').delete().in('id', createdBranchIds);
    }
    await admin
      .from('branches')
      .delete()
      .ilike('name', `RLS Test Branch%${RUN_ID}`);
    for (const id of createdUserIds) {
      await admin.auth.admin.deleteUser(id).catch(() => undefined);
    }
  }, 30000);

  // ===========================================================================
  // Item 1 — profiles_select_branch_scoped
  // ===========================================================================
  describe('item 1: profiles select is branch-scoped', () => {
    it('positive: a user can read their own profile', async () => {
      const { data, error } = await userA.client
        .from('profiles')
        .select('id')
        .eq('id', userA.id)
        .maybeSingle();
      expect(error).toBeNull();
      expect(data?.id).toBe(userA.id);
    });

    it('positive: a user can read the profile of someone who shares a branch with them', async () => {
      const { data, error } = await userA.client
        .from('profiles')
        .select('id')
        .eq('id', userC.id)
        .maybeSingle();
      expect(error).toBeNull();
      expect(data?.id).toBe(userC.id);
    });

    it('negative: a user cannot read the profile of someone who shares no branch with them', async () => {
      const { data, error } = await userA.client
        .from('profiles')
        .select('id')
        .eq('id', userB.id)
        .maybeSingle();
      expect(error).toBeNull();
      expect(data).toBeNull();
    });
  });

  // ===========================================================================
  // Items 3 & 4 — uba_insert self-escalation hole + branches_insert_authenticated
  // ===========================================================================
  describe('items 3 & 4: branch bootstrap moves to create_branch_with_admin RPC', () => {
    it('negative: a plain authenticated user cannot INSERT a branch row directly', async () => {
      const { error } = await userB.client
        .from('branches')
        .insert({ name: `direct-insert-should-fail-${RUN_ID}` });
      expect(error).not.toBeNull();
    });

    it('negative: a non-admin cannot self-insert an admin user_branch_access row on an existing branch', async () => {
      const { error } = await userB.client.from('user_branch_access').insert({
        user_id: userB.id,
        branch_id: branchX,
        role: 'admin',
      });
      expect(error).not.toBeNull();
    });

    it('positive: create_branch_with_admin atomically creates a branch and its first admin row', async () => {
      const { data, error } = await userB.client.rpc('create_branch_with_admin', {
        p_name: `Bootstrap Branch ${RUN_ID}`,
        p_address: null,
        p_vertical: 'generic',
        p_whatsapp: null,
      });
      expect(error).toBeNull();
      expect(data?.id).toBeTruthy();
      if (data?.id) createdBranchIds.push(data.id);

      const { data: access, error: accessErr } = await admin
        .from('user_branch_access')
        .select('role')
        .eq('user_id', userB.id)
        .eq('branch_id', data.id)
        .maybeSingle();
      expect(accessErr).toBeNull();
      expect(access?.role).toBe('admin');
    });
  });

  // ===========================================================================
  // Item 5 — update_order role fix + completed/cancelled guard
  // ===========================================================================
  describe('item 5: update_order authorizes role=user and blocks editing closed orders', () => {
    it("positive: role='user' staff member (previously blocked by role in ('admin','barber')) can update an order", async () => {
      const { data: created, error: createErr } = await userC.client.rpc('create_manual_order', {
        p_branch_id: branchX,
        p_customer_name: 'Cliente Item5',
        p_customer_phone: '+595981000001',
        p_items: [{ service_id: (await seedService(branchX, 'Servicio 5a')).id, qty: 1 }],
      });
      expect(createErr).toBeNull();
      const orderId = created?.order_id;
      expect(orderId).toBeTruthy();

      const { error: updateErr } = await userC.client.rpc('update_order', {
        p_order_id: orderId,
        p_customer_name: 'Cliente Item5 Editado',
        p_customer_phone: '+595981000001',
        p_customer_email: null,
        p_note: null,
        p_payment_method: 'efectivo',
        p_delivery_type: 'pickup',
        p_delivery_address: null,
        p_status: 'confirmed',
        p_items: [{ service_id: (await seedService(branchX, 'Servicio 5b')).id, qty: 1 }],
      });
      expect(updateErr).toBeNull();
    });

    it('negative: update_order raises VC409 when the order is already completed', async () => {
      const service = await seedService(branchX, 'Servicio 5c');
      const { data: created, error: createErr } = await userC.client.rpc('create_manual_order', {
        p_branch_id: branchX,
        p_customer_name: 'Cliente Item5 Completado',
        p_customer_phone: '+595981000002',
        p_items: [{ service_id: service.id, qty: 1 }],
      });
      expect(createErr).toBeNull();
      const orderId = created?.order_id;

      // Complete the order first (legitimate transition).
      const { error: completeErr } = await userC.client.rpc('update_order', {
        p_order_id: orderId,
        p_customer_name: 'Cliente Item5 Completado',
        p_customer_phone: '+595981000002',
        p_customer_email: null,
        p_note: null,
        p_payment_method: 'efectivo',
        p_delivery_type: 'pickup',
        p_delivery_address: null,
        p_status: 'completed',
        p_items: [{ service_id: service.id, qty: 1 }],
      });
      expect(completeErr).toBeNull();

      // Now try to edit it again — must be blocked with VC409.
      const { error: editAfterCompleteErr } = await userC.client.rpc('update_order', {
        p_order_id: orderId,
        p_customer_name: 'Intento tardio',
        p_customer_phone: '+595981000002',
        p_customer_email: null,
        p_note: null,
        p_payment_method: 'efectivo',
        p_delivery_type: 'pickup',
        p_delivery_address: null,
        p_status: 'completed',
        p_items: [{ service_id: service.id, qty: 1 }],
      });
      expect(editAfterCompleteErr).not.toBeNull();
      expect(editAfterCompleteErr?.message).toMatch(/completado|cancelado|VC409/i);
    });
  });

  // ===========================================================================
  // Item 6 — orders_update_admin_or_user WITH CHECK + financial-field trigger
  // ===========================================================================
  describe('item 6: direct client order updates cannot tamper with financial fields', () => {
    it('positive: a legitimate direct status-only update still works', async () => {
      const service = await seedService(branchX, 'Servicio 6a');
      const { data: created } = await userC.client.rpc('create_manual_order', {
        p_branch_id: branchX,
        p_customer_name: 'Cliente Item6a',
        p_customer_phone: '+595981000003',
        p_items: [{ service_id: service.id, qty: 1 }],
      });
      const orderId = created?.order_id;

      const { error } = await userC.client
        .from('orders')
        .update({ status: 'confirmed' })
        .eq('id', orderId);
      expect(error).toBeNull();

      const { data: row } = await admin.from('orders').select('status').eq('id', orderId).single();
      expect(row?.status).toBe('confirmed');
    });

    it('negative: a direct client update cannot change total/delivery_fee (bypasses update_order repricing)', async () => {
      const service = await seedService(branchX, 'Servicio 6b');
      const { data: created } = await userC.client.rpc('create_manual_order', {
        p_branch_id: branchX,
        p_customer_name: 'Cliente Item6b',
        p_customer_phone: '+595981000004',
        p_items: [{ service_id: service.id, qty: 1 }],
      });
      const orderId = created?.order_id;
      const originalTotal = created?.total;

      const { error } = await userC.client
        .from('orders')
        .update({ total: 1 })
        .eq('id', orderId);
      expect(error).not.toBeNull();

      const { data: row } = await admin.from('orders').select('total').eq('id', orderId).single();
      expect(row?.total).toBe(originalTotal);
    });
  });

  // ===========================================================================
  // Item 7 — movements_update_admin_or_user closed-period guard
  // ===========================================================================
  describe('item 7: movements already covered by a cash closing cannot be edited', () => {
    it('positive: a movement created after the latest closing can still be edited', async () => {
      const { data: movement, error: insertErr } = await userC.client
        .from('movements')
        .insert({
          type: 'servicio',
          income: 1000,
          payment_method: 'efectivo',
          user_id: userC.id,
          branch_id: branchX,
        })
        .select('id')
        .single();
      expect(insertErr).toBeNull();

      const { error: updateErr } = await userC.client
        .from('movements')
        .update({ comment: 'edited before any closing' })
        .eq('id', movement!.id);
      expect(updateErr).toBeNull();
    });

    it('negative: a movement predating the latest cash closing cannot be edited', async () => {
      const { data: movement, error: insertErr } = await userC.client
        .from('movements')
        .insert({
          type: 'servicio',
          income: 2000,
          payment_method: 'efectivo',
          user_id: userC.id,
          branch_id: branchX,
        })
        .select('id, created_at')
        .single();
      expect(insertErr).toBeNull();

      // Force a closing timestamped after the movement, as admin (service role
      // bypasses RLS/closed_by ownership checks — only used for fixture setup).
      const { error: closingErr } = await admin.from('cash_closings').insert({
        branch_id: branchX,
        closed_by: userA.id,
        period_start: new Date(Date.now() - 60_000).toISOString(),
        closed_at: new Date(Date.now() + 60_000).toISOString(),
        arqueo_enabled: false,
      });
      expect(closingErr).toBeNull();

      // A USING-clause RLS failure on UPDATE filters the row out silently (0
      // rows affected) rather than raising a client-visible error, so assert
      // on the persisted state instead of the (often null) error.
      await userC.client
        .from('movements')
        .update({ comment: 'should be blocked' })
        .eq('id', movement!.id);

      const { data: row } = await admin
        .from('movements')
        .select('comment')
        .eq('id', movement!.id)
        .single();
      expect(row?.comment).not.toBe('should be blocked');
    });
  });

  // ===========================================================================
  // M-2 follow-up — a direct client update cannot flip a completed/cancelled
  // order's status either (closes the path update_order's own guard doesn't
  // cover: orders/[id]/page.tsx's raw `.update({status})` for non-'completed'
  // targets). Fixed in 20260922010000_freeze_completed_orders_and_grant_cleanup.sql.
  // ===========================================================================
  describe('M-2: a direct client update cannot reopen/cancel a completed order', () => {
    it('negative: a direct status update on a completed order is blocked', async () => {
      const service = await seedService(branchX, 'Servicio M2a');
      const { data: created } = await userC.client.rpc('create_manual_order', {
        p_branch_id: branchX,
        p_customer_name: 'Cliente M2',
        p_customer_phone: '+595981000005',
        p_items: [{ service_id: service.id, qty: 1 }],
      });
      const orderId = created?.order_id;

      const { error: completeErr } = await userC.client.rpc('update_order', {
        p_order_id: orderId,
        p_customer_name: 'Cliente M2',
        p_customer_phone: '+595981000005',
        p_customer_email: null,
        p_note: null,
        p_payment_method: 'efectivo',
        p_delivery_type: 'pickup',
        p_delivery_address: null,
        p_status: 'completed',
        p_items: [{ service_id: service.id, qty: 1 }],
      });
      expect(completeErr).toBeNull();

      // Bypasses update_order entirely — exactly what orders/[id]/page.tsx's
      // handleStatusChange does for a non-'completed' target status.
      const { error } = await userC.client
        .from('orders')
        .update({ status: 'cancelled' })
        .eq('id', orderId);
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/completado|cancelado|VC409/i);

      const { data: row } = await admin.from('orders').select('status').eq('id', orderId).single();
      expect(row?.status).toBe('completed');
    });
  });

  // ===========================================================================
  // O-4 — complete_order_payment: atomic movement+status completion,
  // idempotent against double-completion. Fixed in
  // 20260922020000_atomic_order_payment_completion.sql.
  // ===========================================================================
  describe('O-4: complete_order_payment is atomic and idempotent', () => {
    it('positive: creates exactly one movement and completes the order', async () => {
      const service = await seedService(branchX, 'Servicio O4a');
      const { data: created } = await userC.client.rpc('create_manual_order', {
        p_branch_id: branchX,
        p_customer_name: 'Cliente O4a',
        p_customer_phone: '+595981000006',
        p_items: [{ service_id: service.id, qty: 1 }],
      });
      const orderId = created?.order_id;

      const { data: result, error } = await userC.client.rpc('complete_order_payment', {
        p_order_id: orderId,
        p_amount_received: created?.total,
      });
      expect(error).toBeNull();
      expect(result?.movement_id).toBeTruthy();

      const { data: order } = await admin.from('orders').select('status').eq('id', orderId).single();
      expect(order?.status).toBe('completed');

      const { data: movements } = await admin.from('movements').select('id').eq('order_id', orderId);
      expect(movements?.length).toBe(1);
    });

    it('negative: calling it again on an already-completed order is rejected (no duplicate movement)', async () => {
      const service = await seedService(branchX, 'Servicio O4b');
      const { data: created } = await userC.client.rpc('create_manual_order', {
        p_branch_id: branchX,
        p_customer_name: 'Cliente O4b',
        p_customer_phone: '+595981000007',
        p_items: [{ service_id: service.id, qty: 1 }],
      });
      const orderId = created?.order_id;

      const { error: firstErr } = await userC.client.rpc('complete_order_payment', {
        p_order_id: orderId,
        p_amount_received: created?.total,
      });
      expect(firstErr).toBeNull();

      const { error: secondErr } = await userC.client.rpc('complete_order_payment', {
        p_order_id: orderId,
        p_amount_received: created?.total,
      });
      expect(secondErr).not.toBeNull();
      expect(secondErr?.message).toMatch(/completado|cancelado|VC409/i);

      const { data: movements } = await admin.from('movements').select('id').eq('order_id', orderId);
      expect(movements?.length).toBe(1);
    });
  });

  async function seedService(branchId: string, name: string) {
    const { data, error } = await admin
      .from('services')
      .insert({ name, price: 10000, branch_id: branchId })
      .select('id')
      .single();
    if (error || !data) throw new Error(`Failed to seed service ${name}: ${error?.message}`);
    return data;
  }
});
