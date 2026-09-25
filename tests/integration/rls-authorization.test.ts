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

    it('regression: a direct update cannot set delivery_fee either, even alongside a legitimate status change (2026-09-22 prod bug)', async () => {
      // This is the exact flow OrderCard.tsx's fee form used to drive before
      // the fix below: a pending delivery order confirmed with a delivery
      // fee via a direct `.from('orders').update({ status, delivery_fee })`
      // (updateOrderStatus in src/lib/data/orders.ts) — no RPC, no
      // `app.bypass_order_guard`. The item-6 guard (rightly) blocks this,
      // which is why every real "aceptar pedido con delivery" in production
      // failed with a 400/VC409 since that migration shipped — the direct
      // path was never a legitimate one for this, `confirm_order_delivery_fee`
      // (item 8 below) is the fix, not loosening this guard.
      const service = await seedService(branchX, 'Servicio delivery-fee-regression');
      const { data: created } = await userC.client.rpc('create_manual_order', {
        p_branch_id: branchX,
        p_customer_name: 'Cliente Delivery',
        p_customer_phone: '+595981000099',
        p_items: [{ service_id: service.id, qty: 1 }],
        p_delivery_type: 'delivery',
        p_delivery_address: 'Calle Falsa 123',
      });
      const orderId = created?.order_id;

      const { error } = await userC.client
        .from('orders')
        .update({ status: 'confirmed', delivery_fee: 15000 })
        .eq('id', orderId);
      expect(error).not.toBeNull();

      const { data: row } = await admin
        .from('orders')
        .select('status, delivery_fee')
        .eq('id', orderId)
        .single();
      expect(row?.status).toBe('pending');
      expect(row?.delivery_fee).toBeNull();
    });
  });

  // ===========================================================================
  // Item 8 — confirm_order_delivery_fee RPC (fixes the item-6 fallout above)
  // ===========================================================================
  describe('item 8: confirm_order_delivery_fee sets the delivery fee and confirms in one call', () => {
    it('positive: a branch member can confirm a pending delivery order with a fee', async () => {
      const service = await seedService(branchX, 'Servicio 8a');
      const { data: created } = await userC.client.rpc('create_manual_order', {
        p_branch_id: branchX,
        p_customer_name: 'Cliente Item8a',
        p_customer_phone: '+595981000010',
        p_items: [{ service_id: service.id, qty: 1 }],
        p_delivery_type: 'delivery',
        p_delivery_address: 'Calle Falsa 123',
      });
      const orderId = created?.order_id;

      const { error } = await userC.client.rpc('confirm_order_delivery_fee', {
        p_order_id: orderId,
        p_delivery_fee: 15000,
      });
      expect(error).toBeNull();

      const { data: row } = await admin
        .from('orders')
        .select('status, delivery_fee')
        .eq('id', orderId)
        .single();
      expect(row?.status).toBe('confirmed');
      expect(row?.delivery_fee).toBe(15000);
    });

    it('negative: a user with no branch access cannot call it', async () => {
      const service = await seedService(branchX, 'Servicio 8b');
      const { data: created } = await userC.client.rpc('create_manual_order', {
        p_branch_id: branchX,
        p_customer_name: 'Cliente Item8b',
        p_customer_phone: '+595981000011',
        p_items: [{ service_id: service.id, qty: 1 }],
        p_delivery_type: 'delivery',
        p_delivery_address: 'Calle Falsa 123',
      });
      const orderId = created?.order_id;

      const { error } = await userB.client.rpc('confirm_order_delivery_fee', {
        p_order_id: orderId,
        p_delivery_fee: 15000,
      });
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/VC403|autorizado/i);
    });

    it('negative: a pickup order (no delivery fee to set) is rejected', async () => {
      const service = await seedService(branchX, 'Servicio 8c');
      const { data: created } = await userC.client.rpc('create_manual_order', {
        p_branch_id: branchX,
        p_customer_name: 'Cliente Item8c',
        p_customer_phone: '+595981000012',
        p_items: [{ service_id: service.id, qty: 1 }],
        p_delivery_type: 'pickup',
      });
      const orderId = created?.order_id;

      const { error } = await userC.client.rpc('confirm_order_delivery_fee', {
        p_order_id: orderId,
        p_delivery_fee: 15000,
      });
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/VC400|delivery/i);
    });

    it('negative: an already-confirmed order cannot be re-confirmed through this RPC', async () => {
      const service = await seedService(branchX, 'Servicio 8d');
      const { data: created } = await userC.client.rpc('create_manual_order', {
        p_branch_id: branchX,
        p_customer_name: 'Cliente Item8d',
        p_customer_phone: '+595981000013',
        p_items: [{ service_id: service.id, qty: 1 }],
        p_delivery_type: 'delivery',
        p_delivery_address: 'Calle Falsa 123',
      });
      const orderId = created?.order_id;

      const first = await userC.client.rpc('confirm_order_delivery_fee', {
        p_order_id: orderId,
        p_delivery_fee: 10000,
      });
      expect(first.error).toBeNull();

      const second = await userC.client.rpc('confirm_order_delivery_fee', {
        p_order_id: orderId,
        p_delivery_fee: 20000,
      });
      expect(second.error).not.toBeNull();
      expect(second.error?.message).toMatch(/VC409|pendiente/i);

      const { data: row } = await admin.from('orders').select('delivery_fee').eq('id', orderId).single();
      expect(row?.delivery_fee).toBe(10000);
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

  // ===========================================================================
  // S-1/S-4 — service-images Storage: bucket applied, uploads/updates/deletes
  // scoped by branch folder. Fixed in
  // 20260922030000_service_images_branch_scoped.sql.
  // ===========================================================================
  describe('S-1/S-4: service-images storage is applied and branch-scoped', () => {
    const uploadedPaths: string[] = [];

    afterAll(async () => {
      if (uploadedPaths.length > 0) {
        await admin.storage.from('service-images').remove(uploadedPaths);
      }
    });

    it('positive: a branch member can upload into their own branch folder', async () => {
      const path = `${branchX}/test-${RUN_ID}.txt`;
      const { error } = await userC.client.storage
        .from('service-images')
        .upload(path, new Blob(['test image bytes']), { contentType: 'text/plain' });
      expect(error).toBeNull();
      uploadedPaths.push(path);
    });

    it('positive: an uploaded object is publicly readable (anon, no session)', async () => {
      const path = `${branchX}/test-public-${RUN_ID}.txt`;
      await admin.storage.from('service-images').upload(path, new Blob(['public']), {
        contentType: 'text/plain',
      });
      uploadedPaths.push(path);

      const anon = createClient(SUPABASE_URL, ANON_KEY!, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data } = anon.storage.from('service-images').getPublicUrl(path);
      const res = await fetch(data.publicUrl);
      expect(res.status).toBe(200);
    });

    it('negative: a member of branch Y cannot upload into branch X\'s folder', async () => {
      const path = `${branchX}/cross-branch-${RUN_ID}.txt`;
      const { error } = await userB.client.storage
        .from('service-images')
        .upload(path, new Blob(['should be blocked']), { contentType: 'text/plain' });
      expect(error).not.toBeNull();
    });

    it('negative: a member of branch Y cannot delete an object in branch X\'s folder', async () => {
      const path = `${branchX}/delete-target-${RUN_ID}.txt`;
      await admin.storage.from('service-images').upload(path, new Blob(['keep me']), {
        contentType: 'text/plain',
      });
      uploadedPaths.push(path);

      const { error } = await userB.client.storage.from('service-images').remove([path]);
      // Supabase storage remove() on a denied object resolves without an
      // error but the object simply isn't removed — assert on persisted
      // state via the admin client instead of the (often null) error.
      void error;
      const { data: listing } = await admin.storage.from('service-images').list(branchX);
      expect(listing?.some((f) => path.endsWith(f.name))).toBe(true);
    });
  });

  // ===========================================================================
  // Follow-up: legacy objects with a non-UUID folder segment (found in
  // production, e.g. "taitashu/menu-bbq.jpg" predating branch-scoped
  // policies) must not crash policy evaluation with a Postgres cast error.
  // Fixed in 20260922040000_fix_storage_uuid_cast_crash.sql.
  // ===========================================================================
  describe('storage: legacy non-UUID-folder objects do not crash RLS evaluation', () => {
    it('a delete attempt on a legacy non-UUID-folder object is a graceful denial, not a DB error', async () => {
      const legacyPath = `taitashu-legacy-${RUN_ID}/menu.jpg`;
      await admin.storage.from('service-images').upload(legacyPath, new Blob(['legacy']), {
        contentType: 'text/plain',
      });

      // The bug: the DELETE policy's USING clause cast the folder segment
      // straight to uuid. For a legacy path like this one ("taitashu-...",
      // not a UUID), evaluating that cast raises a real Postgres error
      // ("invalid input syntax for type uuid") instead of just denying —
      // remove() surfaces that as a genuine error, not the usual silent
      // "0 rows affected" RLS denial (see the cross-branch delete test
      // above for what a normal denial looks like: no error, row persists).
      const { error: deleteErr } = await userC.client.storage
        .from('service-images')
        .remove([legacyPath]);
      expect(deleteErr).toBeNull();

      const { data: stillThere } = await admin.storage.from('service-images').list('taitashu-legacy-' + RUN_ID);
      expect(stillThere?.some((f) => f.name === 'menu.jpg')).toBe(true);

      await admin.storage.from('service-images').remove([legacyPath]);
    });
  });

  // ===========================================================================
  // SW-M1 — 'pos' is a valid orders.payment_method end to end (staff-facing
  // paths only: create_manual_order, update_order, the orders table check
  // constraint). Fixed in
  // 20260922050000_pos_payment_method_and_closing_overlap_guard.sql.
  // ===========================================================================
  describe("SW-M1: 'pos' payment method is accepted for staff-created orders", () => {
    it("positive: create_manual_order accepts payment_method='pos' and labels it correctly in the WhatsApp message", async () => {
      const service = await seedService(branchX, 'Servicio POS');
      const { data, error } = await userC.client.rpc('create_manual_order', {
        p_branch_id: branchX,
        p_customer_name: 'Cliente POS',
        p_customer_phone: '+595981000008',
        p_items: [{ service_id: service.id, qty: 1 }],
        p_payment_method: 'pos',
      });
      expect(error).toBeNull();
      expect(data?.whatsapp_message).toMatch(/\*Pago:\* POS/);

      const { data: row } = await admin.from('orders').select('payment_method').eq('id', data.order_id).single();
      expect(row?.payment_method).toBe('pos');
    });

    it('positive: update_order accepts payment_method=\'pos\'', async () => {
      const service = await seedService(branchX, 'Servicio POS Edit');
      const { data: created } = await userC.client.rpc('create_manual_order', {
        p_branch_id: branchX,
        p_customer_name: 'Cliente POS Edit',
        p_customer_phone: '+595981000009',
        p_items: [{ service_id: service.id, qty: 1 }],
      });

      const { error } = await userC.client.rpc('update_order', {
        p_order_id: created?.order_id,
        p_customer_name: 'Cliente POS Edit',
        p_customer_phone: '+595981000009',
        p_customer_email: null,
        p_note: null,
        p_payment_method: 'pos',
        p_delivery_type: 'pickup',
        p_delivery_address: null,
        p_status: 'confirmed',
        p_items: [{ service_id: service.id, qty: 1 }],
      });
      expect(error).toBeNull();

      const { data: row } = await admin.from('orders').select('payment_method').eq('id', created?.order_id).single();
      expect(row?.payment_method).toBe('pos');
    });
  });

  // ===========================================================================
  // SW-C2 — overlapping cash_closings for the same branch are rejected.
  // ===========================================================================
  describe('SW-C2: overlapping closings for the same branch are rejected', () => {
    it('positive: a closing whose period starts after the branch\'s latest closing succeeds', async () => {
      const first = await admin
        .from('cash_closings')
        .insert({
          branch_id: branchY,
          closed_by: userB.id,
          period_start: new Date(Date.now() - 120_000).toISOString(),
          closed_at: new Date(Date.now() - 60_000).toISOString(),
          arqueo_enabled: false,
        })
        .select('id')
        .single();
      expect(first.error).toBeNull();

      const { error } = await admin.from('cash_closings').insert({
        branch_id: branchY,
        closed_by: userB.id,
        period_start: new Date(Date.now() - 30_000).toISOString(),
        closed_at: new Date().toISOString(),
        arqueo_enabled: false,
      });
      expect(error).toBeNull();
    });

    it('negative: a closing whose period starts before the branch\'s latest closing is rejected', async () => {
      // Dedicated branch, not branchX/branchY — both already accumulate
      // closings from earlier describe blocks in this suite (e.g. item 7's
      // movements guard fixture), which would make "the branch's latest
      // closing" unpredictable here.
      const { data: branchZ, error: branchErr } = await admin
        .from('branches')
        .insert({ name: `RLS Test Branch Z ${RUN_ID}` })
        .select('id')
        .single();
      expect(branchErr).toBeNull();
      createdBranchIds.push(branchZ!.id);

      const anchor = await admin
        .from('cash_closings')
        .insert({
          branch_id: branchZ!.id,
          closed_by: userA.id,
          period_start: new Date(Date.now() - 60_000).toISOString(),
          closed_at: new Date().toISOString(),
          arqueo_enabled: false,
        })
        .select('id')
        .single();
      expect(anchor.error).toBeNull();

      const { error } = await admin.from('cash_closings').insert({
        branch_id: branchZ!.id,
        closed_by: userA.id,
        // Starts BEFORE the anchor closing already closed — overlap.
        period_start: new Date(Date.now() - 90_000).toISOString(),
        closed_at: new Date(Date.now() + 60_000).toISOString(),
        arqueo_enabled: false,
      });
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/superpone|VC409/i);
    });
  });

  // ===========================================================================
  // O-6 — update_order accepted a negative p_delivery_fee with no range
  // check (confirm_order_delivery_fee already validated this correctly).
  // ===========================================================================
  describe('O-6: update_order rejects a negative delivery fee', () => {
    it('negative: a negative delivery fee is rejected, order total unaffected', async () => {
      const service = await seedService(branchX, 'Servicio O6');
      const { data: created } = await userC.client.rpc('create_manual_order', {
        p_branch_id: branchX,
        p_customer_name: 'Cliente O6',
        p_customer_phone: '+595981000020',
        p_items: [{ service_id: service.id, qty: 1 }],
        p_delivery_type: 'delivery',
        p_delivery_address: 'Calle Falsa 123',
      });
      const orderId = created?.order_id;
      const originalTotal = created?.total;
      // Found by the RDD review: without these, a broken setup and a
      // successful negative-fee rejection were indistinguishable -- the
      // test could pass for the wrong reason (undefined === undefined).
      expect(orderId).toBeTruthy();
      expect(originalTotal).toBeGreaterThan(0);

      const { error } = await userC.client.rpc('update_order', {
        p_order_id: orderId,
        p_customer_name: 'Cliente O6',
        p_customer_phone: '+595981000020',
        p_customer_email: null,
        p_note: null,
        p_payment_method: 'efectivo',
        p_delivery_type: 'delivery',
        p_delivery_address: 'Calle Falsa 123',
        p_status: 'pending',
        p_items: [{ service_id: service.id, qty: 1 }],
        p_delivery_fee: -5000,
      });
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/costo de delivery/i);

      const { data: row } = await admin.from('orders').select('total, delivery_fee').eq('id', orderId).single();
      expect(row?.total).toBe(originalTotal);
    });
  });

  // ===========================================================================
  // A-7 — profiles_update_own had no column restriction / WITH CHECK: a user
  // could rewrite their own profiles.email, which the invite route
  // (src/app/api/users/invite/route.ts) uses to look up accounts.
  // ===========================================================================
  describe('A-7: profiles_update_own cannot change email, can still change full_name', () => {
    it('positive: a user can still update their own full_name', async () => {
      const { error } = await userA.client
        .from('profiles')
        .update({ full_name: 'Updated Name' })
        .eq('id', userA.id);
      expect(error).toBeNull();

      const { data: row } = await admin
        .from('profiles')
        .select('full_name')
        .eq('id', userA.id)
        .single();
      expect(row?.full_name).toBe('Updated Name');
    });

    it('negative: a user cannot change their own email', async () => {
      const { data: before } = await admin
        .from('profiles')
        .select('email')
        .eq('id', userA.id)
        .single();

      await userA.client
        .from('profiles')
        .update({ email: 'hijacked@example.com' })
        .eq('id', userA.id);

      const { data: after } = await admin
        .from('profiles')
        .select('email')
        .eq('id', userA.id)
        .single();
      expect(after?.email).toBe(before?.email);
    });

    // Note: this is blocked by the policy's USING clause (auth.uid() = id
    // filters the row out before it's ever a candidate row), not by
    // WITH CHECK -- WITH CHECK only re-validates a row USING already let
    // through, e.g. if id itself were reassignable. Named for what it
    // actually proves, per the RDD review.
    it('negative: a user cannot update someone else\'s profile row', async () => {
      await userA.client
        .from('profiles')
        .update({ full_name: 'Hijacked' })
        .eq('id', userB.id);

      const { data: row } = await admin
        .from('profiles')
        .select('full_name')
        .eq('id', userB.id)
        .single();
      expect(row?.full_name).not.toBe('Hijacked');
    });
  });

  // ===========================================================================
  // O-5 — create_storefront_order's rate-limit checks (count-then-insert)
  // weren't atomic against concurrent calls. Fixed in
  // 20260924020000_serialize_storefront_order_rate_limit.sql via an
  // advisory lock keyed on (branch, phone).
  //
  // Honesty note: forcing the original race deterministically would need
  // an artificial delay hook inside the RPC, which isn't worth adding to
  // production code for a test. This proves the FIXED code enforces the
  // 3-per-10-minutes-per-phone limit exactly under real concurrent load
  // (6 simultaneous calls -> exactly 3 succeed, every run) rather than
  // proving the old code could occasionally let more than 3 through.
  // ===========================================================================
  describe('O-5: concurrent submits for the same phone cannot bypass the rate limit', () => {
    it('firing 6 simultaneous create_storefront_order calls for the same phone yields exactly 3 successes', async () => {
      const phone = '+595981000040';
      const anon = createClient(SUPABASE_URL, ANON_KEY!, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      // storefront_enabled is derived by a trigger from whatsapp_number
      // (compute_branch_slug()) -- setting it directly is a no-op.
      const { data: storefrontBranch, error: branchErr } = await admin
        .from('branches')
        .insert({
          name: `RLS Test Storefront Branch ${RUN_ID}`,
          is_active: true,
          whatsapp_number: '+595981000000',
        })
        .select('id, slug')
        .single();
      expect(branchErr).toBeNull();
      createdBranchIds.push(storefrontBranch!.id);
      const service = await seedService(storefrontBranch!.id, 'Servicio O5');

      const results = await Promise.all(
        Array.from({ length: 6 }, () =>
          anon.rpc('create_storefront_order', {
            p_slug: storefrontBranch!.slug,
            p_customer_name: 'Cliente O5 Concurrente',
            p_customer_phone: phone,
            p_items: [{ service_id: service.id, qty: 1 }],
          })
        )
      );

      const successes = results.filter((r) => r.error === null);
      const rateLimited = results.filter((r) => r.error?.message?.match(/VC429|Demasiados/i));

      expect(successes.length).toBe(3);
      expect(rateLimited.length).toBe(3);

      if (successes.length > 0) {
        const orderIds = successes.map((r) => r.data?.order_id).filter(Boolean);
        await admin.from('orders').delete().in('id', orderIds);
      }
    });
  });

  // ===========================================================================
  // O-7/P-4 — order codes are per-branch now, not one shared global
  // sequence. Fixed in 20260924010000_per_branch_order_numbering.sql.
  // ===========================================================================
  describe('O-7/P-4: order codes are numbered independently per branch', () => {
    it('positive: two orders in the same branch get sequential codes', async () => {
      const service = await seedService(branchX, 'Servicio O7a');
      const first = await userC.client.rpc('create_manual_order', {
        p_branch_id: branchX,
        p_customer_name: 'Cliente O7a',
        p_customer_phone: '+595981000030',
        p_items: [{ service_id: service.id, qty: 1 }],
      });
      const second = await userC.client.rpc('create_manual_order', {
        p_branch_id: branchX,
        p_customer_name: 'Cliente O7b',
        p_customer_phone: '+595981000031',
        p_items: [{ service_id: service.id, qty: 1 }],
      });

      expect(first.error).toBeNull();
      expect(second.error).toBeNull();
      const codeA = Number(first.data?.order_code);
      const codeB = Number(second.data?.order_code);
      expect(codeB).toBe(codeA + 1);
    });

    it('positive: a different branch starts its own numbering, independent of branchX', async () => {
      const serviceX = await seedService(branchX, 'Servicio O7c');
      const serviceY = await seedService(branchY, 'Servicio O7d');

      const orderX = await userC.client.rpc('create_manual_order', {
        p_branch_id: branchX,
        p_customer_name: 'Cliente O7c',
        p_customer_phone: '+595981000032',
        p_items: [{ service_id: serviceX.id, qty: 1 }],
      });
      const orderY = await userB.client.rpc('create_manual_order', {
        p_branch_id: branchY,
        p_customer_name: 'Cliente O7d',
        p_customer_phone: '+595981000033',
        p_items: [{ service_id: serviceY.id, qty: 1 }],
      });

      expect(orderX.error).toBeNull();
      expect(orderY.error).toBeNull();
      // Not asserting a specific number (branchY accumulates codes across
      // this whole test file's earlier cases) -- only that branchX's own
      // sequence never skipped because of writes in a different branch.
      const codeXBefore = Number(orderX.data?.order_code);
      const secondOrderX = await userC.client.rpc('create_manual_order', {
        p_branch_id: branchX,
        p_customer_name: 'Cliente O7e',
        p_customer_phone: '+595981000034',
        p_items: [{ service_id: serviceX.id, qty: 1 }],
      });
      expect(Number(secondOrderX.data?.order_code)).toBe(codeXBefore + 1);
    });
  });

  // ===========================================================================
  // SW-O4 — edit_confirmed_order_delivery_fee: a dedicated RPC to edit the
  // delivery fee of an already-confirmed order (no UI wiring yet, backend
  // scaffolding only per Package 2's backend-only track). Reuses the O-6
  // non-negative-fee guard and respects the O-1/M-2 status-freeze trigger.
  // Fixed in 20260924030000_edit_confirmed_order_delivery_fee.sql.
  // ===========================================================================
  describe('SW-O4: edit_confirmed_order_delivery_fee edits the fee of a confirmed order', () => {
    async function createConfirmedDeliveryOrder(label: string, phone: string, fee = 10000) {
      const service = await seedService(branchX, `Servicio ${label}`);
      const { data: created } = await userC.client.rpc('create_manual_order', {
        p_branch_id: branchX,
        p_customer_name: `Cliente ${label}`,
        p_customer_phone: phone,
        p_items: [{ service_id: service.id, qty: 1 }],
        p_delivery_type: 'delivery',
        p_delivery_address: 'Calle Falsa 123',
      });
      const orderId = created?.order_id;
      const { error } = await userC.client.rpc('confirm_order_delivery_fee', {
        p_order_id: orderId,
        p_delivery_fee: fee,
      });
      if (error) throw new Error(`fixture: confirm_order_delivery_fee failed: ${error.message}`);
      return orderId as string;
    }

    // M-10 (2026-09-25, found live in production data cross-check, fixed
    // here): orders.total is items-only everywhere else in the system --
    // confirm_order_delivery_fee never touches it, complete_order_payment
    // computes `total + delivery_fee` on top of it, and both display
    // formulas (OrderCard.tsx/OrderViewPanel.tsx) do the same. This RPC's
    // old formula (`total - old_fee + new_fee`) wrongly assumed total
    // already included the old fee, which double-counted it once displayed
    // or completed. The fix: total must never change here, only
    // delivery_fee -- same contract as confirm_order_delivery_fee.
    it('positive: a branch member can edit the delivery fee of a confirmed order, total (items-only) is untouched', async () => {
      const orderId = await createConfirmedDeliveryOrder('SWO4a', '+595981000050', 10000);
      const { data: before } = await admin
        .from('orders')
        .select('total, delivery_fee')
        .eq('id', orderId)
        .single();
      expect(before?.delivery_fee).toBe(10000);

      const { data, error } = await userC.client.rpc('edit_confirmed_order_delivery_fee', {
        p_order_id: orderId,
        p_delivery_fee: 25000,
      });
      expect(error).toBeNull();
      expect(data?.delivery_fee).toBe(25000);

      const { data: after } = await admin
        .from('orders')
        .select('total, delivery_fee')
        .eq('id', orderId)
        .single();
      expect(after?.delivery_fee).toBe(25000);
      expect(after?.total).toBe(before?.total);
    });

    it('negative: rejects a negative delivery fee, order unchanged (reuses the O-6 guard)', async () => {
      const orderId = await createConfirmedDeliveryOrder('SWO4b', '+595981000051', 10000);

      const { error } = await userC.client.rpc('edit_confirmed_order_delivery_fee', {
        p_order_id: orderId,
        p_delivery_fee: -1,
      });
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/VC400|costo de delivery/i);

      const { data: row } = await admin.from('orders').select('delivery_fee').eq('id', orderId).single();
      expect(row?.delivery_fee).toBe(10000);
    });

    it('negative: rejects editing the fee of an order that is not yet confirmed (still pending)', async () => {
      const service = await seedService(branchX, 'Servicio SWO4c');
      const { data: created } = await userC.client.rpc('create_manual_order', {
        p_branch_id: branchX,
        p_customer_name: 'Cliente SWO4c',
        p_customer_phone: '+595981000052',
        p_items: [{ service_id: service.id, qty: 1 }],
        p_delivery_type: 'delivery',
        p_delivery_address: 'Calle Falsa 123',
      });

      const { error } = await userC.client.rpc('edit_confirmed_order_delivery_fee', {
        p_order_id: created?.order_id,
        p_delivery_fee: 5000,
      });
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/VC409|pendiente|confirmado/i);
    });

    it('negative: rejects editing the fee of a completed order (status-freeze guard, O-1/M-2)', async () => {
      const orderId = await createConfirmedDeliveryOrder('SWO4d', '+595981000053', 10000);
      const { error: completeErr } = await userC.client.rpc('complete_order_payment', {
        p_order_id: orderId,
        p_amount_received: 999999,
      });
      expect(completeErr).toBeNull();

      const { error } = await userC.client.rpc('edit_confirmed_order_delivery_fee', {
        p_order_id: orderId,
        p_delivery_fee: 5000,
      });
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/VC409|completado|confirmado/i);

      const { data: row } = await admin.from('orders').select('delivery_fee').eq('id', orderId).single();
      expect(row?.delivery_fee).toBe(10000);
    });

    it('negative: a user with no branch access cannot call it', async () => {
      const orderId = await createConfirmedDeliveryOrder('SWO4e', '+595981000054', 10000);

      const { error } = await userB.client.rpc('edit_confirmed_order_delivery_fee', {
        p_order_id: orderId,
        p_delivery_fee: 5000,
      });
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/VC403|autorizado/i);

      const { data: row } = await admin.from('orders').select('delivery_fee').eq('id', orderId).single();
      expect(row?.delivery_fee).toBe(10000);
    });
  });

  // ===========================================================================
  // O-8 — cancel_order: dedicated cancellation RPC requiring a reason string,
  // recorded in orders.cancellation_reason/cancelled_at/cancelled_by (no UI
  // wiring yet, backend scaffolding only). Respects the existing O-1/M-2
  // status-freeze trigger (a completed/already-cancelled order cannot be
  // re-cancelled or reopened through this or any other path).
  // Fixed in 20260924030000_cancel_order_with_reason.sql.
  // ===========================================================================
  describe('O-8: cancel_order records a mandatory reason and freezes the order', () => {
    it('positive: a branch member can cancel a pending order with a reason', async () => {
      const service = await seedService(branchX, 'Servicio O8a');
      const { data: created } = await userC.client.rpc('create_manual_order', {
        p_branch_id: branchX,
        p_customer_name: 'Cliente O8a',
        p_customer_phone: '+595981000060',
        p_items: [{ service_id: service.id, qty: 1 }],
      });
      const orderId = created?.order_id;

      const { data, error } = await userC.client.rpc('cancel_order', {
        p_order_id: orderId,
        p_reason: 'Cliente no contesta el telefono',
      });
      expect(error).toBeNull();
      expect(data?.status).toBe('cancelled');

      const { data: row } = await admin
        .from('orders')
        .select('status, cancellation_reason, cancelled_at, cancelled_by')
        .eq('id', orderId)
        .single();
      expect(row?.status).toBe('cancelled');
      expect(row?.cancellation_reason).toBe('Cliente no contesta el telefono');
      expect(row?.cancelled_at).toBeTruthy();
      expect(row?.cancelled_by).toBe(userC.id);
    });

    it('negative: rejects a missing/blank reason, order unchanged', async () => {
      const service = await seedService(branchX, 'Servicio O8b');
      const { data: created } = await userC.client.rpc('create_manual_order', {
        p_branch_id: branchX,
        p_customer_name: 'Cliente O8b',
        p_customer_phone: '+595981000061',
        p_items: [{ service_id: service.id, qty: 1 }],
      });
      const orderId = created?.order_id;

      const missing = await userC.client.rpc('cancel_order', {
        p_order_id: orderId,
        p_reason: null,
      });
      expect(missing.error).not.toBeNull();
      expect(missing.error?.message).toMatch(/VC400|motivo/i);

      const blank = await userC.client.rpc('cancel_order', {
        p_order_id: orderId,
        p_reason: '   ',
      });
      expect(blank.error).not.toBeNull();
      expect(blank.error?.message).toMatch(/VC400|motivo/i);

      const { data: row } = await admin.from('orders').select('status').eq('id', orderId).single();
      expect(row?.status).toBe('pending');
    });

    it('negative: cannot cancel an already-completed order (status-freeze guard)', async () => {
      const service = await seedService(branchX, 'Servicio O8c');
      const { data: created } = await userC.client.rpc('create_manual_order', {
        p_branch_id: branchX,
        p_customer_name: 'Cliente O8c',
        p_customer_phone: '+595981000062',
        p_items: [{ service_id: service.id, qty: 1 }],
      });
      const orderId = created?.order_id;
      const { error: completeErr } = await userC.client.rpc('complete_order_payment', {
        p_order_id: orderId,
        p_amount_received: created?.total,
      });
      expect(completeErr).toBeNull();

      const { error } = await userC.client.rpc('cancel_order', {
        p_order_id: orderId,
        p_reason: 'Intento tardio',
      });
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/VC409|completado|cancelado/i);

      const { data: row } = await admin.from('orders').select('status').eq('id', orderId).single();
      expect(row?.status).toBe('completed');
    });

    it('negative: cannot cancel an already-cancelled order (cannot silently un-cancel)', async () => {
      const service = await seedService(branchX, 'Servicio O8d');
      const { data: created } = await userC.client.rpc('create_manual_order', {
        p_branch_id: branchX,
        p_customer_name: 'Cliente O8d',
        p_customer_phone: '+595981000063',
        p_items: [{ service_id: service.id, qty: 1 }],
      });
      const orderId = created?.order_id;

      const first = await userC.client.rpc('cancel_order', {
        p_order_id: orderId,
        p_reason: 'Primer motivo',
      });
      expect(first.error).toBeNull();

      const second = await userC.client.rpc('cancel_order', {
        p_order_id: orderId,
        p_reason: 'Segundo motivo, intento de reabrir',
      });
      expect(second.error).not.toBeNull();
      expect(second.error?.message).toMatch(/VC409|completado|cancelado/i);

      const { data: row } = await admin
        .from('orders')
        .select('status, cancellation_reason')
        .eq('id', orderId)
        .single();
      expect(row?.status).toBe('cancelled');
      expect(row?.cancellation_reason).toBe('Primer motivo');
    });

    it('negative: a user with no branch access cannot call it', async () => {
      const service = await seedService(branchX, 'Servicio O8e');
      const { data: created } = await userC.client.rpc('create_manual_order', {
        p_branch_id: branchX,
        p_customer_name: 'Cliente O8e',
        p_customer_phone: '+595981000064',
        p_items: [{ service_id: service.id, qty: 1 }],
      });
      const orderId = created?.order_id;

      const { error } = await userB.client.rpc('cancel_order', {
        p_order_id: orderId,
        p_reason: 'No deberia poder',
      });
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/VC403|autorizado/i);

      const { data: row } = await admin.from('orders').select('status').eq('id', orderId).single();
      expect(row?.status).toBe('pending');
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
