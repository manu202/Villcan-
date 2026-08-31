import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useBranchRole } from './useBranchRole';

const mockUseBranch = vi.fn();
vi.mock('@/contexts/BranchContext', () => ({
  useBranch: () => mockUseBranch(),
}));

describe('useBranchRole (REQ: viewer role enforcement)', () => {
  beforeEach(() => {
    mockUseBranch.mockReset();
  });

  it('admin -> canWrite is true', () => {
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'b1', name: 'Centro', user_role: 'admin' },
    });

    const { result } = renderHook(() => useBranchRole());

    expect(result.current.role).toBe('admin');
    expect(result.current.canWrite).toBe(true);
  });

  it('barber -> canWrite is true', () => {
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'b1', name: 'Centro', user_role: 'barber' },
    });

    const { result } = renderHook(() => useBranchRole());

    expect(result.current.role).toBe('barber');
    expect(result.current.canWrite).toBe(true);
  });

  it('viewer -> canWrite is false', () => {
    mockUseBranch.mockReturnValue({
      currentBranch: { id: 'b1', name: 'Centro', user_role: 'viewer' },
    });

    const { result } = renderHook(() => useBranchRole());

    expect(result.current.role).toBe('viewer');
    expect(result.current.canWrite).toBe(false);
  });

  it('no current branch -> role is null and canWrite is false', () => {
    mockUseBranch.mockReturnValue({ currentBranch: null });

    const { result } = renderHook(() => useBranchRole());

    expect(result.current.role).toBeNull();
    expect(result.current.canWrite).toBe(false);
  });
});
