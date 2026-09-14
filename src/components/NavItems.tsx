'use client';

import { usePathname } from 'next/navigation';
import { HamburgerMenu } from './HamburgerMenu';
import { BottomNav } from './BottomNav';

// Routes that render a full-page layout and must NOT show the app shell nav.
// Kept in sync with AuthGuard's PUBLIC_PATHS — if you add a route here,
// also add it there.
const NO_NAV_PATHS = ['/login', '/logout', '/auth/set-password'];

export function NavItems({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hideNav = NO_NAV_PATHS.includes(pathname);

  if (hideNav) {
    return <>{children}</>;
  }

  return (
    <>
      <HamburgerMenu />
      <main
        className="main-content"
        style={{ paddingBottom: 'calc(56px + env(safe-area-inset-bottom))' }}
      >
        {children}
      </main>
      <BottomNav />
    </>
  );
}
