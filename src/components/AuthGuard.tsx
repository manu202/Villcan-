'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Spinner } from './Spinner';

// Routes reachable without a session. Everything else redirects to /login —
// there is no server-side route protection (middleware.ts is a deliberate
// pass-through), so this client-side guard is the only thing standing
// between an unauthenticated visitor and a confusing wander through empty
// pages instead of a clear prompt to sign in.
const PUBLIC_PATHS = ['/login', '/logout'];

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isPublic = PUBLIC_PATHS.includes(pathname);
  const [sessionConfirmed, setSessionConfirmed] = useState(false);

  useEffect(() => {
    if (isPublic) return;

    const supabase = createClient();
    let cancelled = false;

    async function checkSession() {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!session) {
        router.replace('/login');
      } else {
        setSessionConfirmed(true);
      }
    }
    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.replace('/login');
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [isPublic, router]);

  if (!isPublic && !sessionConfirmed) {
    return (
      <div className="auth-guard-loading">
        <Spinner size={36} />
        <style>{`
          .auth-guard-loading {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
          }
        `}</style>
      </div>
    );
  }

  return <>{children}</>;
}
