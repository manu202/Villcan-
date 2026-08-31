import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { usePendingOrdersCount } from './usePendingOrdersCount';

const mockUseBranch = vi.fn();
vi.mock('@/contexts/BranchContext', () => ({
  useBranch: () => mockUseBranch(),
}));

let mockCountResult: { count: number | null; error: unknown };

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => Promise.resolve(mockCountResult),
        }),
      }),
    }),
  }),
}));

describe('usePendingOrdersCount (REQ: pending-orders badge on HamburgerMenu)', () => {
  beforeEach(() => {
    mockUseBranch.mockReset();
  });

  it('returns the pending count for the current branch', async () => {
    mockUseBranch.mockReturnValue({ currentBranch: { id: 'b1' }, initialized: true });
    mockCountResult = { count: 3, error: null };

    const { result } = renderHook(() => usePendingOrdersCount());

    await waitFor(() => expect(result.current).toBe(3));
  });

  it('returns 0 when there is no current branch (different path — no query fires)', () => {
    mockUseBranch.mockReturnValue({ currentBranch: null, initialized: true });
    mockCountResult = { count: 99, error: null };

    const { result } = renderHook(() => usePendingOrdersCount());

    expect(result.current).toBe(0);
  });
});
