import type { Metadata, Viewport } from 'next';
import { Inter, Archivo_Black, Space_Grotesk } from 'next/font/google';
import Script from 'next/script';
import { ToastProvider } from '@/contexts/ToastContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { ErrorLogger } from '@/components/ErrorLogger';
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

// Backoffice visual-refresh typefaces (--font-display / --font-refresh-sans
// below, consumed by globals.css). Loaded here so they're self-hosted at
// build time; exposed only as CSS variables, so the storefront (which sets
// its own fonts per template) is unaffected.
const archivoBlack = Archivo_Black({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  variable: '--font-display',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  display: 'swap',
  variable: '--font-refresh-sans',
});

export const metadata: Metadata = {
  title: 'Villcan',
  description: 'Gestión de caja y movimientos',
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
  //
  // Session-bound providers (BranchProvider/SettingsProvider/AuthGuard) live
  // in src/app/(app)/layout.tsx, NOT here — the root layout is shared by the
  // public storefront ((public)/tienda/[slug]), which has no session and must
  // not mount them. See design "AuthGuard — el fix".
  return (
    <html
      lang="es"
      className={`${inter.className} ${archivoBlack.variable} ${spaceGrotesk.variable}`}
      suppressHydrationWarning
    >
      <body>
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
        <ThemeProvider>
          <ToastProvider>
            <ErrorLogger />
            {children}
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}