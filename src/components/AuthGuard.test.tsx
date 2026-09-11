import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthGuard } from './AuthGuard';

const mockReplace = vi.fn();
let mockPathname = '/';

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ replace: mockReplace }),
}));

// TDD (RED→GREEN): tests use getUser (server-validated) instead of getSession
// (localStorage-only). getUser returns { data: { user }, error }.
const mockGetUser = vi.fn();
const mockOnAuthStateChange = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: () => mockGetUser(),
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        mockOnAuthStateChange(cb);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
  }),
}));

describe('AuthGuard', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockGetUser.mockReset();
    mockOnAuthStateChange.mockReset();
    mockPathname = '/';
  });

  it('redirects to /login when there is no user on a protected route', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    render(
      <AuthGuard>
        <p>Protected content</p>
      </AuthGuard>
    );

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/login'));
    expect(screen.queryByText('Protected content')).toBeNull();
  });

  it('redirects to /login when getUser returns an error (e.g. AuthSessionMissingError)', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { name: 'AuthSessionMissingError', message: 'No active session' },
    });
    render(
      <AuthGuard>
        <p>Protected content</p>
      </AuthGuard>
    );

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/login'));
    expect(screen.queryByText('Protected content')).toBeNull();
  });

  it('renders children when a valid user is returned', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    render(
      <AuthGuard>
        <p>Protected content</p>
      </AuthGuard>
    );

    await waitFor(() => expect(screen.getByText('Protected content')).toBeTruthy());
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('does not redirect or block rendering on /login itself, even with no user', () => {
    mockPathname = '/login';
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    render(
      <AuthGuard>
        <p>Login form</p>
      </AuthGuard>
    );

    expect(screen.getByText('Login form')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('treats /tienda/[slug] as protected if ever rendered inside it (documents why route groups, not PUBLIC_PATHS, keep the storefront public)', async () => {
    mockPathname = '/tienda/mi-negocio';
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    render(
      <AuthGuard>
        <p>Storefront content</p>
      </AuthGuard>
    );

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/login'));
    expect(screen.queryByText('Storefront content')).toBeNull();
  });

  it('redirects to /login if the session disappears later (SIGNED_OUT event)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    render(
      <AuthGuard>
        <p>Protected content</p>
      </AuthGuard>
    );
    await waitFor(() => expect(screen.getByText('Protected content')).toBeTruthy());

    expect(mockOnAuthStateChange).toHaveBeenCalled();
    const authChangeCallback = mockOnAuthStateChange.mock.calls.at(-1)![0];
    authChangeCallback('SIGNED_OUT', null);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/login'));
  });

  it('does NOT redirect on INITIAL_SESSION event with no session (avoids hydration redirect)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    render(
      <AuthGuard>
        <p>Protected content</p>
      </AuthGuard>
    );
    await waitFor(() => expect(screen.getByText('Protected content')).toBeTruthy());

    const authChangeCallback = mockOnAuthStateChange.mock.calls.at(-1)![0];
    authChangeCallback('INITIAL_SESSION', null);

    // Should NOT have redirected (INITIAL_SESSION is filtered out)
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
