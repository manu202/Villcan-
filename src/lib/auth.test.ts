import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSignOut = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { signOut: mockSignOut },
  }),
}));

describe('signOut', () => {
  beforeEach(() => {
    mockSignOut.mockReset();
  });

  // A-13: default scope is 'global' (every device/session) -- a user logging
  // out on their own phone should not also kick out a register terminal.
  it("signs out with { scope: 'local' } only, not every device", async () => {
    mockSignOut.mockResolvedValue({ error: null });

    const { signOut } = await import('./auth');
    await signOut();

    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' });
  });
});
