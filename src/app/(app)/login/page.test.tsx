import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import LoginPage from './page';

const mockReplace = vi.fn();
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
}));

const mockGetUser = vi.fn();
const mockSignInWithPassword = vi.fn();
vi.mock('@/lib/auth', () => ({
  getUser: () => mockGetUser(),
  signInWithPassword: (...args: unknown[]) => mockSignInWithPassword(...args),
}));

describe('LoginPage', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockPush.mockReset();
    mockGetUser.mockReset();
    mockSignInWithPassword.mockReset();
  });

  // A-12: a visitor who's already signed in (bookmark, stale tab, back
  // button after logging in) should be sent to the app, not shown the form.
  it('redirects to / when a user is already authenticated', async () => {
    mockGetUser.mockResolvedValue({ id: 'u1' });
    render(<LoginPage />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
  });

  it('shows the login form when there is no active session', async () => {
    mockGetUser.mockResolvedValue(null);
    render(<LoginPage />);

    await waitFor(() => expect(mockGetUser).toHaveBeenCalled());
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByText('Ingresar')).toBeTruthy();
  });
});
