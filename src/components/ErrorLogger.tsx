'use client';

import { useEffect, useRef } from 'react';
import { useBranch } from '@/contexts/BranchContext';
import { getCurrentUserId } from '@/lib/auth';
import { setupGlobalErrorLogging } from '@/lib/errorLogging';

// Mounted once in the root layout. Keeps the current user/branch in a ref
// (read fresh by the getter, not captured at setup time) so error reports
// always reflect who was actually active when something broke — this is
// the free, self-hosted alternative to a third-party error tracker.
export function ErrorLogger() {
  const { currentBranch } = useBranch();
  const contextRef = useRef<{ userId: string | null; branchId: string | null }>({
    userId: null,
    branchId: null,
  });

  useEffect(() => {
    contextRef.current.branchId = currentBranch?.id ?? null;
  }, [currentBranch]);

  useEffect(() => {
    let cancelled = false;
    getCurrentUserId().then((id) => {
      if (!cancelled) contextRef.current.userId = id;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const teardown = setupGlobalErrorLogging(() => contextRef.current);
    return teardown;
  }, []);

  return null;
}
