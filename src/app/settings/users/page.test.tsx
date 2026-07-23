import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import UsersPage from './page';

const mockUseBranch = vi.fn();
vi.mock('@/contexts/BranchContext', () => ({
  useBranch: () => mockUseBranch(),
}));

const mockShowToast = vi.fn();
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

const mockUbaEq = vi.fn();
const mockUbaSelect = vi.fn();
const mockFrom = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

describe('UsersPage /settings/users (REQ-SETTINGSREORG-4, -8, -9)', () => {
  beforeEach(() => {
    mockUbaEq.mockReset();
    mockUbaSelect.mockReset();
    mockFrom.mockReset();
    mockShowToast.mockReset();

    mockUbaEq.mockResolvedValue({
      data: [
        { user_id: 'admin-1', role: 'admin', profiles: { email: 'admin@test.com', full_name: 'Admin One' } },
      ],
      error: null,
    });
    mockUbaSelect.mockReturnValue({ eq: mockUbaEq });
    mockFrom.mockReturnValue({ select: mockUbaSelect });
  });

  it('renders an access-restricted state when the user is not admin anywhere', () => {
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'b1', name: 'Centro', user_role: 'barber' },
      branches: [{ id: 'b1', user_role: 'barber' }],
      isLoading: false,
    });

    render(<UsersPage />);

    expect(screen.getByText(/acceso restringido/i)).toBeTruthy();
  });

  it('shows a notice and disables mutations when admin elsewhere but not of currentBranch', async () => {
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'b1', name: 'Centro', user_role: 'barber' },
      branches: [
        { id: 'b1', user_role: 'barber' },
        { id: 'b2', user_role: 'admin' },
      ],
      isLoading: false,
    });

    render(<UsersPage />);

    expect(screen.queryByText(/acceso restringido/i)).toBeNull();
    expect(screen.getByText(/no sos administrador de esta sucursal/i)).toBeTruthy();
    await waitFor(() => expect(mockFrom).toHaveBeenCalledWith('user_branch_access'));
    expect(screen.queryByText(/^agregar$/i)).toBeNull();
  });

  it('disables remove/downgrade with an inline explanation for the sole admin row', async () => {
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'b1', name: 'Centro', user_role: 'admin' },
      branches: [{ id: 'b1', user_role: 'admin' }],
      isLoading: false,
    });

    render(<UsersPage />);

    await waitFor(() => expect(mockFrom).toHaveBeenCalledWith('user_branch_access'));

    const removeButton = await screen.findByRole('button', { name: /quitar/i });
    expect((removeButton as HTMLButtonElement).disabled).toBe(true);

    const roleSelect = screen.getByRole('combobox', { name: /rol de admin@test.com/i });
    expect((roleSelect as HTMLSelectElement).disabled).toBe(true);

    expect(screen.getByText(/único administrador de esta sucursal/i)).toBeTruthy();
  });
});
