import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthGuard } from './AuthGuard';

const mockReplace = vi.fn();
let mockPathname = '/';
// Real Next.js router objects are referentially stable across renders;
// returning a fresh object per call here would make AuthGuard's
// `useEffect(..., [isPublic, router])` re-fire on every render (any state
// update, e.g. from a retry), re-invoking checkSession an extra time.
const mockRouter = { replace: mockReplace };

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => mockRouter,
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

  // A-9: a plain network failure (e.g. offline PWA, flaky connection) was
  // treated identically to "you are logged out" -- getUser() wraps a fetch
  // failure in an AuthRetryableFetchError, distinguishable from a real
  // rejection like AuthSessionMissingError.
  it('does not redirect immediately on a retryable network error, and renders children if a retry succeeds', async () => {
    mockGetUser
      .mockResolvedValueOnce({
        data: { user: null },
        error: { name: 'AuthRetryableFetchError', message: 'fetch failed' },
      })
      .mockResolvedValueOnce({ data: { user: { id: 'u1' } }, error: null });

    render(
      <AuthGuard>
        <p>Protected content</p>
      </AuthGuard>
    );

    // The first (retryable) failure must not bounce to /login immediately.
    await waitFor(() => expect(mockGetUser).toHaveBeenCalledTimes(1));
    expect(mockReplace).not.toHaveBeenCalled();

    await waitFor(() => expect(screen.getByText('Protected content')).toBeTruthy(), {
      timeout: 3000,
    });
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockGetUser).toHaveBeenCalledTimes(2);
  });

  it('redirects to /login if the retry after a network error also fails to confirm a user', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { name: 'AuthRetryableFetchError', message: 'fetch failed' },
    });

    render(
      <AuthGuard>
        <p>Protected content</p>
      </AuthGuard>
    );

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/login'), { timeout: 3000 });
    expect(screen.queryByText('Protected content')).toBeNull();
    expect(mockGetUser).toHaveBeenCalledTimes(2);
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
