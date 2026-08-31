import 'server-only';
import { createClient } from '@supabase/supabase-js';

/**
 * Service-role Supabase client. Bypasses RLS entirely — never expose this
 * client or the underlying key to the browser. The `import 'server-only'`
 * above makes an accidental import from a `'use client'` module fail the
 * build instead of silently shipping the service-role key in the bundle.
 *
 * Uses the plain `@supabase/supabase-js` client (not `@supabase/ssr`) since
 * there is no browser session to persist or cookies to read/write here.
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Missing Supabase admin configuration: NEXT_PUBLIC_SUPABASE_URL and ' +
        'SUPABASE_SERVICE_ROLE_KEY must both be set.'
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
