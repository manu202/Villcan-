import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import SetPasswordPage from './page';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockGetUser = vi.fn();
const mockOnAuthStateChange = vi.fn();
const mockUpdateUser = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: () => mockGetUser(),
      onAuthStateChange: (cb: (event: string) => void) => {
        mockOnAuthStateChange(cb);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
      updateUser: (args: unknown) => mockUpdateUser(args),
    },
  }),
}));

describe('SetPasswordPage (A-5: expired/used invite link must not spin forever)', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockGetUser.mockReset();
    mockOnAuthStateChange.mockReset();
    mockUpdateUser.mockReset();
    window.location.hash = '';
  });

  it('shows the friendly error state (not an infinite spinner) when the link hash carries an error (expired/used invite or recovery link)', async () => {
    window.location.hash =
      '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired';
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    render(<SetPasswordPage />);

    await waitFor(() =>
      expect(
        screen.getByText(/expiró o ya fue utilizado/i)
      ).toBeTruthy()
    );
    expect(screen.queryByText('Verificando invitación...')).toBeNull();
  });

  it('still renders the password form once SIGNED_IN fires for a valid link', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    render(<SetPasswordPage />);

    const cb = mockOnAuthStateChange.mock.calls.at(-1)![0];
    cb('SIGNED_IN');

    await waitFor(() => expect(screen.getByLabelText('Contraseña')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Activar cuenta' })).toBeTruthy();
  });

  it('shows "reset password" copy instead of "activate account" copy for a recovery link (type=recovery in the hash)', async () => {
    window.location.hash = '#access_token=abc&refresh_token=def&type=recovery';
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    render(<SetPasswordPage />);

    const cb = mockOnAuthStateChange.mock.calls.at(-1)![0];
    cb('SIGNED_IN');

    await waitFor(() => expect(screen.getByText('Restablecé tu contraseña')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Guardar contraseña' })).toBeTruthy();
  });
});
