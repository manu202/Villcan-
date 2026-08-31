'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useBranch } from '@/contexts/BranchContext';

const POLL_INTERVAL_MS = 30_000;

/**
 * Pending-orders count for the HamburgerMenu badge (task 5.2). Same 30s
 * polling cadence as the /orders panel itself — Realtime is out of scope
 * (design "Rutas y componentes").
 */
export function usePendingOrdersCount(): number {
  const { currentBranch, initialized } = useBranch();
  const [count, setCount] = useState(0);
  const branchRef = useRef(currentBranch);

  useEffect(() => {
    branchRef.current = currentBranch;
  }, [currentBranch]);

  useEffect(() => {
    if (!initialized || !currentBranch) {
      setCount(0);
      return;
    }

    let cancelled = false;

    const load = async () => {
      const branch = branchRef.current;
      if (!branch) return;
      const supabase = createClient();
      const { count: pendingCount, error } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('branch_id', branch.id)
        .eq('status', 'pending');

      if (cancelled) return;
      if (!error && typeof pendingCount === 'number') {
        setCount(pendingCount);
      }
    };

    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [initialized, currentBranch]);

  return count;
}
