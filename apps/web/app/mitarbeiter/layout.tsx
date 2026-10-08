import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { EmployeeShell } from '@/components/employee/employee-shell';
import { PwaHead } from '@/components/pwa-head';
import {
  buildOfflineSnapshot,
  countMyUnreadNotifications,
  employeeBranding,
  employeeLocale,
  requireEmployee,
} from '@/lib/data/employee';

export const metadata: Metadata = {
  title: 'ReinPlan',
  manifest: '/mitarbeiter/manifest.webmanifest',
  /*
    iOS ignores the manifest's icons entirely and uses the apple-touch-icon
    link, so without this line an installed field app would carry a screenshot
    of the page instead of the mark.
  */
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Mitarbeiter' },
  icons: {
    icon: [
      { url: '/icons/employee-icon.svg', type: 'image/svg+xml' },
      { url: '/icons/employee-icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/icons/employee-apple-touch-180.png', sizes: '180x180', type: 'image/png' }],
  },
};

/* The field app's own bar colour, so the status bar matches once installed. */
export const viewport: Viewport = { themeColor: '#05785A' };

const employeePwa = {
  manifest: '/mitarbeiter/manifest.webmanifest',
  icon: '/icons/employee-icon-192.png',
  appleIcon: '/icons/employee-apple-touch-180.png',
};

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  /*
   * The sign-in screen lives at /mitarbeiter/login, inside this layout, but it
   * is the one page here that cannot require a session: requireEmployee() sends
   * an anonymous visitor to /login?app=team, which forwards to
   * /mitarbeiter/login, which renders this layout again. The page bounced
   * between the two forever — 152 navigations in four seconds — so the employee
   * app had no reachable sign-in at all.
   *
   * The path comes from the header the middleware already sets for exactly this
   * kind of question. It decides what to render, never who may see it: the
   * login screen is public either way, and every other page under /mitarbeiter
   * still goes through requireEmployee() below.
   */
  const pathname = (await headers()).get('x-pathname') ?? '';
  if (pathname === '/mitarbeiter/login') {
    return (
      <>
        <PwaHead {...employeePwa} />
        {children}
      </>
    );
  }

  // The snapshot is built server-side from the employee's own RLS-checked rows
  // and handed to the client, which is the only thing it is allowed to cache.
  const [{ user }, locale, branding, unread, snapshot] = await Promise.all([
    requireEmployee(),
    employeeLocale(),
    employeeBranding(),
    countMyUnreadNotifications(),
    buildOfflineSnapshot(),
  ]);
  return (
    <>
      <PwaHead {...employeePwa} />
      <EmployeeShell locale={locale} branding={branding} unread={unread} userId={user.id} snapshot={snapshot}>
        {children}
      </EmployeeShell>
    </>
  );
}
