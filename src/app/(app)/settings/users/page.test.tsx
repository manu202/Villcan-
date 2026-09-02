import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import UsersPage from './page';

const mockUseBranch = vi.fn();
vi.mock('@/contexts/BranchContext', () => ({
  useBranch: () => mockUseBranch(),
}));

const mockShowToast = vi.fn();
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

const mockUseSettings = vi.fn();
vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => mockUseSettings(),
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
    mockUseSettings.mockReset();
    mockUseSettings.mockReturnValue({ settings: { staff_label: 'Barbero' } });

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
      currentBranch: { id: 'b1', name: 'Centro', user_role: 'user' },
      branches: [{ id: 'b1', user_role: 'user' }],
      isLoading: false,
    });

    render(<UsersPage />);

    expect(screen.getByText(/acceso restringido/i)).toBeTruthy();
  });

  it('shows a notice and disables mutations when admin elsewhere but not of currentBranch', async () => {
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'b1', name: 'Centro', user_role: 'user' },
      branches: [
        { id: 'b1', user_role: 'user' },
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

describe('UsersPage role label uses staff_label from settings (generalize-verticals)', () => {
  beforeEach(() => {
    mockUbaEq.mockReset();
    mockUbaSelect.mockReset();
    mockFrom.mockReset();
    mockShowToast.mockReset();
    mockUseSettings.mockReset();

    mockUbaEq.mockResolvedValue({
      data: [
        { user_id: 'admin-1', role: 'admin', profiles: { email: 'admin@test.com', full_name: 'Admin One' } },
      ],
      error: null,
    });
    mockUbaSelect.mockReturnValue({ eq: mockUbaEq });
    mockFrom.mockReturnValue({ select: mockUbaSelect });

    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'b1', name: 'Centro', user_role: 'admin' },
      branches: [{ id: 'b1', user_role: 'admin' }],
      isLoading: false,
    });
  });

  it('renders the configured staff_label instead of the hardcoded "Barbero"', async () => {
    mockUseSettings.mockReturnValue({ settings: { staff_label: 'Operador' } });

    render(<UsersPage />);

    await waitFor(() => expect(mockFrom).toHaveBeenCalledWith('user_branch_access'));

    const roleSelect = screen.getByRole('combobox', { name: 'Rol' });
    expect(within(roleSelect).getByText('Operador')).toBeTruthy();
    expect(within(roleSelect).queryByText('Barbero')).toBeNull();
  });

  it('renders a different configured staff_label without hardcoding "Operador" either', async () => {
    mockUseSettings.mockReturnValue({ settings: { staff_label: 'Mozo' } });

    render(<UsersPage />);

    await waitFor(() => expect(mockFrom).toHaveBeenCalledWith('user_branch_access'));

    const roleSelect = screen.getByRole('combobox', { name: 'Rol' });
    expect(within(roleSelect).getByText('Mozo')).toBeTruthy();
  });
});

describe('UsersPage handleAddUser invite flow (REQ: server-side user provisioning)', () => {
  beforeEach(() => {
    mockUbaEq.mockReset();
    mockUbaSelect.mockReset();
    mockFrom.mockReset();
    mockShowToast.mockReset();
    mockUseSettings.mockReset();
    mockUseSettings.mockReturnValue({ settings: { staff_label: 'Barbero' } });

    mockUbaEq.mockResolvedValue({
      data: [
        { user_id: 'admin-1', role: 'admin', profiles: { email: 'admin@test.com', full_name: 'Admin One' } },
      ],
      error: null,
    });
    mockUbaSelect.mockReturnValue({ eq: mockUbaEq });
    mockFrom.mockReturnValue({ select: mockUbaSelect });

    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'b1', name: 'Centro', user_role: 'admin' },
      branches: [{ id: 'b1', user_role: 'admin' }],
      isLoading: false,
    });

    vi.stubGlobal('fetch', vi.fn());
  });

  async function fillAndSubmit(email: string) {
    await waitFor(() => expect(mockFrom).toHaveBeenCalledWith('user_branch_access'));
    const emailInput = screen.getByPlaceholderText('Email');
    fireEvent.change(emailInput, { target: { value: email } });
    const submitButton = screen.getByRole('button', { name: /invitar/i });
    fireEvent.click(submitButton);
  }

  it('invites a new user via POST /api/users/invite and shows a success toast', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ user_id: 'new-user-1', invited: true }),
    });

    render(<UsersPage />);
    await fillAndSubmit('nuevo@example.com');

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/users/invite',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ email: 'nuevo@example.com', role: 'user', branch_id: 'b1' }),
        })
      )
    );
    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringMatching(/invitaci/i), 'success')
    );
  });

  it('shows the server error toast on a 403 rejection', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'No autorizado' }),
    });

    render(<UsersPage />);
    await fillAndSubmit('nuevo@example.com');

    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('No autorizado', 'error'));
  });

  it('is idempotent for a duplicate email: still succeeds, invited: false', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ user_id: 'existing-user-1', invited: false }),
    });

    render(<UsersPage />);
    await fillAndSubmit('existing@example.com');

    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringMatching(/agregad/i), 'success')
    );
  });
});
