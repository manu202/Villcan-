import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// `server-only` throws unconditionally when resolved outside Next's bundler
// (which normally aliases it to a no-op for server bundles). Stub it here so
// this file can unit-test admin.ts without a full Next build.
vi.mock('server-only', () => ({}));

const mockCreateClient = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

describe('createAdminClient (server-side service-role client)', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    mockCreateClient.mockReset();
    mockCreateClient.mockReturnValue({ __fake: 'admin-client' });
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('throws when SUPABASE_SERVICE_ROLE_KEY is missing', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co';
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const { createAdminClient } = await import('./admin');

    expect(() => createAdminClient()).toThrow();
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it('throws when NEXT_PUBLIC_SUPABASE_URL is missing', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';

    const { createAdminClient } = await import('./admin');

    expect(() => createAdminClient()).toThrow();
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it('builds a client with the service-role key and persistSession disabled', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';

    const { createAdminClient } = await import('./admin');
    const client = createAdminClient();

    expect(mockCreateClient).toHaveBeenCalledWith(
      'https://project.supabase.co',
      'service-role-secret',
      expect.objectContaining({
        auth: expect.objectContaining({
          persistSession: false,
          autoRefreshToken: false,
        }),
      })
    );
    expect(client).toEqual({ __fake: 'admin-client' });
  });
});
