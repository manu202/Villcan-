import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BranchProvider, useBranch } from './BranchContext';
import type { BranchWithRole } from '@/types';

const mockGetUserBranches = vi.fn();
vi.mock('@/lib/branches', async () => {
  const actual = await vi.importActual<typeof import('@/lib/branches')>('@/lib/branches');
  return {
    ...actual,
    getUserBranches: () => mockGetUserBranches(),
  };
});

let authStateCallback: ((event: string, session: unknown) => void) | null = null;
const mockUnsubscribe = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        authStateCallback = cb;
        return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
      },
    },
  }),
}));

const branch: BranchWithRole = {
  id: 'b1',
  name: 'Sucursal Central',
  address: null,
  is_active: true,
  created_at: '2026-01-01',
  user_role: 'admin',
};

function Consumer() {
  const { currentBranch, branches } = useBranch();
  return (
    <div>
      <span data-testid="current">{currentBranch?.name ?? 'none'}</span>
      <span data-testid="count">{branches.length}</span>
    </div>
  );
}

describe('BranchContext', () => {
  beforeEach(() => {
    mockGetUserBranches.mockReset();
    mockUnsubscribe.mockReset();
    authStateCallback = null;
    localStorage.clear();
  });

  it('re-fetches branches when auth state changes after a no-session initial load (login via client-side navigation)', async () => {
    // Simulates mounting on /login before signing in: no branches yet.
    mockGetUserBranches.mockResolvedValueOnce([]);
    render(
      <BranchProvider>
        <Consumer />
      </BranchProvider>
    );

    await waitFor(() => expect(screen.getByTestId('current').textContent).toBe('none'));

    // Now the user logs in via router.push (no full page reload) — the auth
    // state change event is the only signal available that a session now
    // exists, so BranchContext must re-fetch on it.
    mockGetUserBranches.mockResolvedValueOnce([branch]);
    expect(authStateCallback).toBeTypeOf('function');
    authStateCallback!('SIGNED_IN', { user: { id: 'u1' } });

    await waitFor(() => expect(screen.getByTestId('current').textContent).toBe('Sucursal Central'));
    expect(screen.getByTestId('count').textContent).toBe('1');
  });

  it('unsubscribes from auth state changes on unmount', () => {
    mockGetUserBranches.mockResolvedValue([]);
    const { unmount } = render(
      <BranchProvider>
        <Consumer />
      </BranchProvider>
    );
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalled();
  });
});
