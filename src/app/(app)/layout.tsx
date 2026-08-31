import { HamburgerMenu } from '@/components/HamburgerMenu';
import { BranchProvider } from '@/contexts/BranchContext';
import { SettingsProvider } from '@/contexts/SettingsContext';
import { AuthGuard } from '@/components/AuthGuard';

// Force dynamic rendering for the whole authenticated back office. These pages
// need a live session + branch context on every request; there's no valid
// build-time prerender for them. Without this, `next build` tries to
// statically generate them anyway and crashes with
// "useBranch must be used within BranchProvider" (BranchProvider only wraps
// this route group now, not the root layout, since the (public) storefront
// must never mount it — see AuthGuard comment below).
export const dynamic = 'force-dynamic';

// Everything under (app) is the authenticated Villcan back office. Session
// providers (BranchProvider/SettingsProvider) and AuthGuard live here, not in
// the root layout — the public storefront ((public)/tienda/[slug]) must never
// mount them: an anonymous visitor has no session, so those providers would
// only fire doomed authenticated queries and flash a login redirect. See
// design "AuthGuard — el fix" (sdd/storefront-whatsapp-orders/design).
export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <BranchProvider>
      <SettingsProvider>
        <AuthGuard>
          <HamburgerMenu />
          <main className="main-content">{children}</main>
        </AuthGuard>
      </SettingsProvider>
    </BranchProvider>
  );
}
