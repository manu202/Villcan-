import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ForgotPasswordPage from './page';

const mockResetPasswordForEmail = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      resetPasswordForEmail: (...args: unknown[]) => mockResetPasswordForEmail(...args),
    },
  }),
}));

describe('ForgotPasswordPage (A-8: forgot-password flow)', () => {
  beforeEach(() => {
    mockResetPasswordForEmail.mockReset();
  });

  it('shows a loading state while the request is in flight', async () => {
    let resolvePromise: (value: { data: object; error: null }) => void = () => {};
    mockResetPasswordForEmail.mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      })
    );

    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));

    expect(screen.getByRole('button', { name: /enviando/i })).toBeTruthy();

    resolvePromise({ data: {}, error: null });
    await waitFor(() => expect(screen.getByText(/si ese email existe/i)).toBeTruthy());
  });

  it('shows the same generic success message regardless of whether the email exists', async () => {
    mockResetPasswordForEmail.mockResolvedValue({ data: {}, error: null });

    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'nonexistent@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));

    await waitFor(() => expect(screen.getByText(/si ese email existe/i)).toBeTruthy());
    expect(mockResetPasswordForEmail).toHaveBeenCalledWith(
      'nonexistent@example.com',
      expect.objectContaining({ redirectTo: expect.stringContaining('/auth/set-password') })
    );
  });

  it('shows an error message when the Supabase call itself throws (e.g. network error)', async () => {
    mockResetPasswordForEmail.mockRejectedValue(new Error('network error'));

    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));

    await waitFor(() =>
      expect(screen.getByText(/no pudimos procesar tu pedido/i)).toBeTruthy()
    );
    expect(screen.queryByText(/si ese email existe/i)).toBeNull();
  });
});
