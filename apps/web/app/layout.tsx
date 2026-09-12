import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SauberWerk',
  description: 'Die Betriebssoftware fuer Reinigungsunternehmen.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="de"><body>{children}</body></html>;
}
