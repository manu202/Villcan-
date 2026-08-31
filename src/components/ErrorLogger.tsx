'use client';

import { useEffect, useRef } from 'react';
import { useBranchOptional } from '@/contexts/BranchContext';
import { getCurrentUserId } from '@/lib/auth';
import { setupGlobalErrorLogging } from '@/lib/errorLogging';

// Mounted once in the root layout, so it renders on every route including
// the public (public) storefront and the special _not-found page — neither
// of which has a BranchProvider above them. useBranchOptional (unlike
// useBranch) returns null there instead of throwing.
export function ErrorLogger() {
  const currentBranch = useBranchOptional()?.currentBranch ?? null;
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
