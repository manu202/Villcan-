import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthGuard } from './AuthGuard';

const mockReplace = vi.fn();
let mockPathname = '/';

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ replace: mockReplace }),
}));

const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getSession: () => mockGetSession(),
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
    mockGetSession.mockReset();
    mockOnAuthStateChange.mockReset();
    mockPathname = '/';
  });

  it('redirects to /login when there is no session on a protected route', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    render(
      <AuthGuard>
        <p>Protected content</p>
      </AuthGuard>
    );

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/login'));
    expect(screen.queryByText('Protected content')).toBeNull();
  });

  it('renders children when a session exists', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    render(
      <AuthGuard>
        <p>Protected content</p>
      </AuthGuard>
    );

    await waitFor(() => expect(screen.getByText('Protected content')).toBeTruthy());
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('does not redirect or block rendering on /login itself, even with no session', () => {
    mockPathname = '/login';
    mockGetSession.mockResolvedValue({ data: { session: null } });
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
    mockGetSession.mockResolvedValue({ data: { session: null } });
    render(
      <AuthGuard>
        <p>Storefront content</p>
      </AuthGuard>
    );

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/login'));
    expect(screen.queryByText('Storefront content')).toBeNull();
  });

  it('redirects to /login if the session disappears later (e.g. expiry) on a protected route', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
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
});
