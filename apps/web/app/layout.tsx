import type { Metadata } from 'next';
import './globals.css';
import { currentLocale } from '@/lib/i18n-server';

export const metadata: Metadata = {
  title: 'SauberWerk',
  description: 'Die Betriebssoftware für Reinigungsunternehmen.',
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await currentLocale();
  return <html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}><body>{children}</body></html>;
}
