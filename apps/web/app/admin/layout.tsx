import type { Metadata, Viewport } from 'next';
import { PwaHead } from '@/components/pwa-head';

/**
 * /admin holds the office sign-in screen. The office app itself lives under
 * /dashboard, so this layout adds no chrome and guards nothing — it exists so
 * the sign-in page carries the office app's identity.
 *
 * That matters for installing: a browser reads the manifest and the
 * apple-touch-icon from the page it is on, and this is the page office staff
 * are looking at when they decide to keep the app on their home screen. Without
 * it, the tile would fall back to a screenshot of the login form.
 */
export const metadata: Metadata = {
  title: 'ReinPlan Büro',
  manifest: '/dashboard/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'ReinPlan' },
  icons: {
    icon: [
      { url: '/icons/admin-icon.svg', type: 'image/svg+xml' },
      { url: '/icons/admin-icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/icons/admin-apple-touch-180.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = { themeColor: '#0F1F21' };

const officePwa = {
  manifest: '/dashboard/manifest.webmanifest',
  icon: '/icons/admin-icon-192.png',
  appleIcon: '/icons/admin-apple-touch-180.png',
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PwaHead {...officePwa} />
      {children}
    </>
  );
}
