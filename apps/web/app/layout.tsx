import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans_Arabic, Onest } from 'next/font/google';
import './globals.css';
import { appEnvironment } from '@/lib/env';
import { direction } from '@/lib/i18n';
import { currentLocale } from '@/lib/i18n-server';

/** Self-hosted by next/font, so no third-party request on first paint. */
const onest = Onest({ subsets: ['latin', 'latin-ext', 'cyrillic'], variable: '--font-sans', display: 'swap' });
/** Onest has no Arabic glyphs; this family covers them in the same stack. */
const arabic = IBM_Plex_Sans_Arabic({ subsets: ['arabic'], weight: ['400', '500', '600', '700'], variable: '--font-arabic', display: 'swap' });

export const metadata: Metadata = {
  title: 'ReinPlan',
  description: 'Die Betriebssoftware für Reinigungsunternehmen.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0B2A33',
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await currentLocale();
  return (
    <html
      lang={locale}
      dir={direction(locale)}
      /* Which deployment this is, readable from the page. Lets the end-to-end
         suite refuse a production target, and tells anyone looking at a
         screenshot which environment produced it. */
      data-app-env={appEnvironment()}
      className={`${onest.variable} ${arabic.variable}`}
    >
      <body className="font-sans">{children}</body>
    </html>
  );
}
