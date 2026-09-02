import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetUser = vi.fn();
const mockRpc = vi.fn();
const mockCreateClient = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

const mockInviteUserByEmail = vi.fn();
const mockProfilesSelect = vi.fn();
const mockProfilesIlike = vi.fn();
const mockProfilesMaybeSingle = vi.fn();
const mockUbaUpsert = vi.fn();
const mockAdminFrom = vi.fn();
const mockCreateAdminClient = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: (...args: unknown[]) => mockCreateAdminClient(...args),
}));

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/users/invite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/users/invite', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockRpc.mockReset();
    mockCreateClient.mockReset();
    mockInviteUserByEmail.mockReset();
    mockProfilesSelect.mockReset();
    mockProfilesIlike.mockReset();
    mockProfilesMaybeSingle.mockReset();
    mockUbaUpsert.mockReset();
    mockAdminFrom.mockReset();
    mockCreateAdminClient.mockReset();

    mockCreateClient.mockResolvedValue({
      auth: { getUser: mockGetUser },
      rpc: mockRpc,
    });

    mockProfilesIlike.mockReturnValue({ maybeSingle: mockProfilesMaybeSingle });
    mockProfilesSelect.mockReturnValue({ ilike: mockProfilesIlike });
    mockUbaUpsert.mockResolvedValue({ error: null });
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'profiles') return { select: mockProfilesSelect };
      if (table === 'user_branch_access') return { upsert: mockUbaUpsert };
      throw new Error(`Unexpected table: ${table}`);
    });
    mockCreateAdminClient.mockReturnValue({
      auth: { admin: { inviteUserByEmail: mockInviteUserByEmail } },
      from: mockAdminFrom,
    });
  });

  it('returns 401 when there is no authenticated session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'no session' } });

    const { POST } = await import('./route');
    const response = await POST(
      makeRequest({ email: 'new@example.com', role: 'user', branch_id: 'b1' })
    );

    expect(response.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockCreateAdminClient).not.toHaveBeenCalled();
  });

  it('returns 403 when the caller is not an admin of the branch', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'caller-1' } }, error: null });
    mockRpc.mockResolvedValue({ data: false, error: null });

    const { POST } = await import('./route');
    const response = await POST(
      makeRequest({ email: 'new@example.com', role: 'user', branch_id: 'b1' })
    );

    expect(response.status).toBe(403);
    expect(mockRpc).toHaveBeenCalledWith('is_branch_admin', { branch: 'b1' });
    expect(mockInviteUserByEmail).not.toHaveBeenCalled();
  });

  it('invites a brand-new user and creates the branch access row (200)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } }, error: null });
    mockRpc.mockResolvedValue({ data: true, error: null });
    mockInviteUserByEmail.mockResolvedValue({
      data: { user: { id: 'new-user-1' } },
      error: null,
    });

    const { POST } = await import('./route');
    const response = await POST(
      makeRequest({ email: 'new@example.com', role: 'user', branch_id: 'b1' })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ user_id: 'new-user-1', invited: true });
    expect(mockUbaUpsert).toHaveBeenCalledWith({
      user_id: 'new-user-1',
      branch_id: 'b1',
      role: 'user',
    });
  });

  it('is idempotent for an email that already has an account (200, invited: false)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } }, error: null });
    mockRpc.mockResolvedValue({ data: true, error: null });
    mockInviteUserByEmail.mockResolvedValue({
      data: null,
      error: { message: 'A user with this email address has already been registered', code: 'email_exists' },
    });
    mockProfilesMaybeSingle.mockResolvedValue({ data: { id: 'existing-user-1' }, error: null });

    const { POST } = await import('./route');
    const response = await POST(
      makeRequest({ email: 'Existing@Example.com', role: 'user', branch_id: 'b1' })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ user_id: 'existing-user-1', invited: false });
    expect(mockProfilesIlike).toHaveBeenCalledWith('email', 'existing@example.com');
    expect(mockUbaUpsert).toHaveBeenCalledWith({
      user_id: 'existing-user-1',
      branch_id: 'b1',
      role: 'user',
    });
  });
});
