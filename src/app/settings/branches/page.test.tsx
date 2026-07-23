import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import BranchesPage from './page';

const mockUseBranch = vi.fn();
vi.mock('@/contexts/BranchContext', () => ({
  useBranch: () => mockUseBranch(),
}));

const mockShowToast = vi.fn();
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

const mockOrder = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

describe('BranchesPage /settings/branches (REQ-SETTINGSREORG-3, REQ-SETTINGSREORG-9)', () => {
  beforeEach(() => {
    mockOrder.mockReset();
    mockSelect.mockReset();
    mockFrom.mockReset();
    mockShowToast.mockReset();

    mockOrder.mockResolvedValue({ data: [] });
    mockSelect.mockReturnValue({ order: mockOrder });
    mockFrom.mockReturnValue({ select: mockSelect });
  });

  it('renders an access-restricted state when the user is not admin anywhere', () => {
    mockUseBranch.mockReturnValue({
      currentBranch: null,
      branches: [{ id: 'b1', user_role: 'barber' }],
      isLoading: false,
    });

    render(<BranchesPage />);

    expect(screen.getByText(/acceso restringido/i)).toBeTruthy();
    expect(screen.queryByText(/\+nueva/i)).toBeNull();
  });

  it('renders branch CRUD (no user-access UI) when admin on at least one branch', async () => {
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'b1', name: 'Centro', user_role: 'admin' },
      branches: [{ id: 'b1', user_role: 'admin' }],
      isLoading: false,
    });

    render(<BranchesPage />);

    await waitFor(() => expect(mockFrom).toHaveBeenCalledWith('branches'));
    expect(screen.queryByText(/acceso restringido/i)).toBeNull();
    expect(screen.getByText(/\+nueva/i)).toBeTruthy();
    expect(screen.queryByText(/\+usuario/i)).toBeNull();
  });
});
