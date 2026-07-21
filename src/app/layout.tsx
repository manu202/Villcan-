import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import Script from 'next/script';
import { HamburgerMenu } from '@/components/HamburgerMenu';
import { ToastProvider } from '@/contexts/ToastContext';
import { BranchProvider } from '@/contexts/BranchContext';
import { SettingsProvider } from '@/contexts/SettingsContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { AuthGuard } from '@/components/AuthGuard';
import './globals.css';

// Blocking, pre-hydration theme/accent stamp — avoids a flash of the wrong
// theme/accent (REQ-THEME-4). Reads cached localStorage values only; the DB
// value for brand_color (source of truth) reconciles once SettingsContext
// loads, in the settings page / SettingsContext (REQ-THEME-5).
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var theme = localStorage.getItem('theme');
    if (theme === 'dark' || theme === 'light') {
      document.documentElement.setAttribute('data-theme', theme);
    }
    var accent = localStorage.getItem('brand_color');
    if (accent) {
      document.documentElement.setAttribute('data-accent', accent);
    }
  } catch (e) {}
})();
`;

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Villcan — Barbería',
  description: 'Gestión de caja y movimientos para barbería',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Villcan',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#121212' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // suppressHydrationWarning below: data-theme/data-accent are stamped on
  // <html> by the blocking pre-hydration script (THEME_INIT_SCRIPT above)
  // and later kept in sync imperatively by ThemeContext/SettingsContext —
  // outside React's own render output entirely. Without this, React treats
  // that as a real mismatch on every load, since it never rendered those
  // attributes itself. Standard pattern for this exact approach (same
  // reason next-themes requires it).
  return (
    <html lang="es" className={inter.className} suppressHydrationWarning>
      <body>
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
        <ThemeProvider>
          <ToastProvider>
            <BranchProvider>
              <SettingsProvider>
                <AuthGuard>
                  <HamburgerMenu />
                  <main className="main-content">{children}</main>
                </AuthGuard>
              </SettingsProvider>
            </BranchProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}