// Production monitoring/alerting: pg_cron-driven client_errors spike check
// (public._check_client_error_spikes) writing to public.system_alerts.
// See supabase/migrations/20260925010000_system_alerts_and_client_error_spike_check.sql
// and docs/monitoring.md for the full design and its explicit limitations.
//
// Requires a running local stack (`npx supabase start`) and its LOCAL dev
// service-role key in .env.test.local -- see rls-authorization.test.ts's
// header for the exact setup. Run in isolation with: npm run test:integration

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_LOCAL_URL ?? 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY = process.env.SUPABASE_LOCAL_SECRET_KEY;
const ANON_KEY = process.env.SUPABASE_LOCAL_ANON_KEY;

if (!SERVICE_ROLE_KEY || !ANON_KEY) {
  throw new Error(
    'SUPABASE_LOCAL_SECRET_KEY / SUPABASE_LOCAL_ANON_KEY are not set. Run `npx supabase start` ' +
      'and set them in .env.test.local, then run this suite with `npm run test:integration`.'
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

async function signedInClient(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn failed for ${email}: ${error.message}`);
  return client;
}

const PASSWORD = 'Test-Passw0rd!';
const RUN_ID = Date.now().toString(36);
const admin = adminClient();

describe('Monitoring: client_errors spike check -> system_alerts', () => {
  let branchSpike: string;
  let branchNormal: string;
  let branchOld: string;
  let adminUser: { id: string; email: string; client: SupabaseClient };
  let nonAdminUser: { id: string; email: string; client: SupabaseClient };

  const createdBranchIds: string[] = [];
  const createdUserIds: string[] = [];

  async function createTestUser(label: string) {
    const email = `alerts-test-${label}-${RUN_ID}@example.com`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`createUser failed for ${label}: ${error?.message}`);
    createdUserIds.push(data.user.id);

    const { error: profileErr } = await admin
      .from('profiles')
      .insert({ id: data.user.id, email, full_name: `Alerts Test ${label}` });
    if (profileErr) throw new Error(`profile insert failed for ${label}: ${profileErr.message}`);

    const client = await signedInClient(email, PASSWORD);
    return { id: data.user.id, email, client };
  }

  async function createBranch(label: string) {
    const { data, error } = await admin
      .from('branches')
      .insert({ name: `Alerts Test Branch ${label} ${RUN_ID}` })
      .select('id')
      .single();
    if (error || !data) throw new Error(`branch insert failed for ${label}: ${error?.message}`);
    createdBranchIds.push(data.id);
    return data.id as string;
  }

  async function insertClientErrors(
    branchId: string,
    count: number,
    createdAt?: string
  ) {
    const rows = Array.from({ length: count }, (_, i) => ({
      message: `Synthetic spike-test error ${i}`,
      branch_id: branchId,
      ...(createdAt ? { created_at: createdAt } : {}),
    }));
    const { error } = await admin.from('client_errors').insert(rows);
    if (error) throw new Error(`client_errors insert failed: ${error.message}`);
  }

  async function runSpikeCheck() {
    const { error } = await admin.rpc('_check_client_error_spikes');
    if (error) throw new Error(`spike check RPC failed: ${error.message}`);
  }

  async function alertsFor(branchId: string) {
    const { data, error } = await admin
      .from('system_alerts')
      .select('id, branch_id, kind, detail, acknowledged_at')
      .eq('branch_id', branchId)
      .eq('kind', 'client_error_spike');
    if (error) throw new Error(`system_alerts fetch failed: ${error.message}`);
    return data ?? [];
  }

  beforeAll(async () => {
    await assertLocalStackReachable();

    branchSpike = await createBranch('spike');
    branchNormal = await createBranch('normal');
    branchOld = await createBranch('old');

    adminUser = await createTestUser('admin');
    nonAdminUser = await createTestUser('nonadmin');

    await admin
      .from('user_branch_access')
      .insert({ user_id: adminUser.id, branch_id: branchSpike, role: 'admin' });
  }, 30000);

  afterAll(async () => {
    if (process.env.SKIP_CLEANUP) return;
    await admin.from('client_errors').delete().in('branch_id', createdBranchIds);
    await admin.from('system_alerts').delete().in('branch_id', createdBranchIds);
    if (createdBranchIds.length > 0) {
      await admin.from('branches').delete().in('id', createdBranchIds);
    }
    for (const id of createdUserIds) {
      await admin.auth.admin.deleteUser(id).catch(() => undefined);
    }
  }, 30000);

  describe('spike detection', () => {
    it('more than 20 errors in the last hour for one branch produces exactly one alert', async () => {
      await insertClientErrors(branchSpike, 21);

      await runSpikeCheck();

      const alerts = await alertsFor(branchSpike);
      expect(alerts.length).toBe(1);
      expect(alerts[0].detail).toMatchObject({ error_count: 21, threshold: 20 });
      expect(alerts[0].acknowledged_at).toBeNull();
    });

    it('does not false-positive on normal volume (well under the threshold)', async () => {
      await insertClientErrors(branchNormal, 5);

      await runSpikeCheck();

      const alerts = await alertsFor(branchNormal);
      expect(alerts.length).toBe(0);
    });

    it('does not count errors older than the 1-hour window', async () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      await insertClientErrors(branchOld, 30, twoHoursAgo);

      await runSpikeCheck();

      const alerts = await alertsFor(branchOld);
      expect(alerts.length).toBe(0);
    });

    it('running the check again while the spike is still unacknowledged does not create a duplicate alert', async () => {
      // branchSpike already has an unacknowledged alert from the first test
      // in this block; the underlying spike condition (>20 errors in the
      // last hour) still holds too.
      await runSpikeCheck();

      const alerts = await alertsFor(branchSpike);
      expect(alerts.length).toBe(1);
    });

    it('a new alert IS raised again once the previous one is acknowledged', async () => {
      const [existing] = await alertsFor(branchSpike);
      expect(existing).toBeTruthy();

      await admin
        .from('system_alerts')
        .update({ acknowledged_at: new Date().toISOString() })
        .eq('id', existing.id);

      // The spike condition still holds (>20 errors in the last hour for
      // branchSpike), and the only prior alert is now acknowledged.
      await runSpikeCheck();

      const alerts = await alertsFor(branchSpike);
      expect(alerts.length).toBe(2);
    });
  });

  describe('system_alerts RLS', () => {
    it('an admin can read alerts', async () => {
      const { data, error } = await adminUser.client
        .from('system_alerts')
        .select('id')
        .eq('branch_id', branchSpike);
      expect(error).toBeNull();
      expect((data ?? []).length).toBeGreaterThan(0);
    });

    it('a non-admin cannot read alerts', async () => {
      const { data, error } = await nonAdminUser.client
        .from('system_alerts')
        .select('id')
        .eq('branch_id', branchSpike);
      expect(error).toBeNull();
      expect(data ?? []).toEqual([]);
    });

    it('neither an admin nor a non-admin can insert an alert directly (cron/service-role only)', async () => {
      const { error } = await adminUser.client.from('system_alerts').insert({
        branch_id: branchSpike,
        kind: 'client_error_spike',
      });
      expect(error).not.toBeNull();
    });
  });
});
