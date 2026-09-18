import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { direction } from '@/lib/i18n';
import { currentLocale } from '@/lib/i18n-server';

/** Self-hosted by next/font, so no third-party request on first paint. */
const inter = Inter({ subsets: ['latin', 'latin-ext', 'cyrillic'], variable: '--font-sans', display: 'swap' });

export const metadata: Metadata = {
  title: 'SauberWerk',
  description: 'Die Betriebssoftware für Reinigungsunternehmen.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0f766e',
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await currentLocale();
  return (
    <html lang={locale} dir={direction(locale)} className={inter.variable}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
