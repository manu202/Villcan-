'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import type { BranchWithRole } from '@/types';
import { getUserBranches } from '@/lib/branches';

interface BranchContextValue {
  currentBranch: BranchWithRole | null;
  branches: BranchWithRole[];
  isLoading: boolean;
  initialized: boolean;
  selectBranch: (branch: BranchWithRole) => void;
  refreshBranches: () => Promise<void>;
}

const BranchContext = createContext<BranchContextValue | null>(null);

export function BranchProvider({ children }: { children: ReactNode }) {
  const [currentBranch, setCurrentBranch] = useState<BranchWithRole | null>(null);
  const [branches, setBranches] = useState<BranchWithRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  const refreshBranches = useCallback(async () => {
    setIsLoading(true);
    try {
      const userBranches = await getUserBranches();
      setBranches(userBranches);

      // Auto-select first branch if there are branches AND none currently selected
      if (userBranches.length >= 1) {
        // Try to find previously saved branch
        const savedBranchId = typeof window !== 'undefined' ? localStorage.getItem('current_branch_id') : null;
        const saved = userBranches.find(b => b.id === savedBranchId);
        const toSelect = saved || userBranches[0];
        
        setCurrentBranch(toSelect);
        
        // Persist selection
        if (typeof window !== 'undefined') {
          localStorage.setItem('current_branch_id', toSelect.id);
        }
      } else {
        // No branches - user has no access yet
        setCurrentBranch(null);
      }
    } catch (error) {
      console.error('Failed to load branches:', error);
      setBranches([]);
      setCurrentBranch(null);
    } finally {
      setIsLoading(false);
      setInitialized(true);
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      await refreshBranches();
    };
    load();
  }, [refreshBranches]);

  const selectBranch = useCallback((branch: BranchWithRole) => {
    setCurrentBranch(branch);
    if (typeof window !== 'undefined') {
      localStorage.setItem('current_branch_id', branch.id);
    }
  }, []);

  return (
    <BranchContext.Provider value={{ currentBranch, branches, isLoading, initialized, selectBranch, refreshBranches }}>
      {children}
    </BranchContext.Provider>
  );
}

export function useBranch() {
  const context = useContext(BranchContext);
  if (!context) {
    throw new Error('useBranch must be used within BranchProvider');
  }
  return context;
}
