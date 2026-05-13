import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { HamburgerMenu } from '@/components/HamburgerMenu';
import './globals.css';

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
  themeColor: '#000000',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={inter.className}>
      <body>
        <HamburgerMenu />
        <main className="main-content">{children}</main>
      </body>
    </html>
  );
}