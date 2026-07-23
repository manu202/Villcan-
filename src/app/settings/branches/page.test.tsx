import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import BranchesPage from './page';

const mockUseBranch = vi.fn();
const mockSelectBranch = vi.fn();
const mockRefreshBranches = vi.fn();
vi.mock('@/contexts/BranchContext', () => ({
  useBranch: () => mockUseBranch(),
}));

const mockShowToast = vi.fn();
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: vi.fn().mockReturnValue({
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      insert: vi.fn().mockResolvedValue({ error: null }),
      delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    }),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
  }),
}));

describe('BranchesPage /settings/branches (REQ-SETTINGSREORG-3, REQ-SETTINGSREORG-9)', () => {
  beforeEach(() => {
    mockShowToast.mockReset();
    mockSelectBranch.mockReset();
    mockRefreshBranches.mockReset();
  });

  it('renders an access-restricted state when the user is not admin anywhere', () => {
    mockUseBranch.mockReturnValue({
      currentBranch: null,
      branches: [{ id: 'b1', name: 'Centro', user_role: 'barber' }],
      isLoading: false,
      selectBranch: mockSelectBranch,
      refreshBranches: mockRefreshBranches,
    });

    render(<BranchesPage />);

    expect(screen.getByText(/acceso restringido/i)).toBeTruthy();
    expect(screen.queryByText(/\+nueva/i)).toBeNull();
  });

  it('renders branch CRUD (no user-access UI) when admin on at least one branch', async () => {
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'b1', name: 'Centro', user_role: 'admin' },
      branches: [{ id: 'b1', name: 'Centro', address: null, user_role: 'admin' }],
      isLoading: false,
      selectBranch: mockSelectBranch,
      refreshBranches: mockRefreshBranches,
    });

    render(<BranchesPage />);

    expect(screen.queryByText(/acceso restringido/i)).toBeNull();
    expect(screen.getByText(/\+nueva/i)).toBeTruthy();
    expect(screen.queryByText(/\+usuario/i)).toBeNull();
    await waitFor(() => expect(screen.getByText('Editar')).toBeTruthy());
  });

  it('hides Editar/Eliminar for a branch where the user is not admin, even if admin elsewhere', () => {
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'b1', name: 'Centro', user_role: 'admin' },
      branches: [
        { id: 'b1', name: 'Centro', address: null, user_role: 'admin' },
        { id: 'b2', name: 'Sucursal Norte', address: null, user_role: 'barber' },
      ],
      isLoading: false,
      selectBranch: mockSelectBranch,
      refreshBranches: mockRefreshBranches,
    });

    render(<BranchesPage />);

    const northItem = screen.getByText('Sucursal Norte').closest('li')!;
    expect(within(northItem).queryByText('Editar')).toBeNull();
    expect(within(northItem).getByText(/sin permisos de administrador/i)).toBeTruthy();
  });

  it('lets the user switch the active branch from a non-current row', () => {
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'b1', name: 'Centro', user_role: 'admin' },
      branches: [
        { id: 'b1', name: 'Centro', address: null, user_role: 'admin' },
        { id: 'b2', name: 'Sucursal Norte', address: null, user_role: 'admin' },
      ],
      isLoading: false,
      selectBranch: mockSelectBranch,
      refreshBranches: mockRefreshBranches,
    });

    render(<BranchesPage />);

    const northItem = screen.getByText('Sucursal Norte').closest('li')!;
    fireEvent.click(within(northItem).getByText(/usar esta sucursal/i));
    expect(mockSelectBranch).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'b2' })
    );
  });

});
