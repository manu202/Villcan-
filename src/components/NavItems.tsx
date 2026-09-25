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
      <div className="refresh-bg-blob refresh-bg-blob-a" aria-hidden="true" />
      <div className="refresh-bg-blob refresh-bg-blob-b" aria-hidden="true" />
      <HamburgerMenu />
      <main
        className="main-content"
        style={{
          paddingBottom: 'calc(96px + env(safe-area-inset-bottom))',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {children}
      </main>
      <BottomNav />

      <style>{`
        .refresh-bg-blob {
          position: fixed;
          width: 320px;
          height: 320px;
          border-radius: 50%;
          pointer-events: none;
          z-index: 0;
          filter: blur(40px);
        }

        .refresh-bg-blob-a {
          top: -120px;
          right: -120px;
          background: radial-gradient(circle, rgba(232, 93, 44, 0.3), rgba(232, 93, 44, 0) 70%);
        }

        .refresh-bg-blob-b {
          bottom: -120px;
          left: -120px;
          background: radial-gradient(circle, rgba(255, 181, 120, 0.4), rgba(255, 181, 120, 0) 70%);
        }
      `}</style>
    </>
  );
}
