import type { Metadata } from 'next';
import { EmployeeShell } from '@/components/employee/employee-shell';
import {
  buildOfflineSnapshot,
  countMyUnreadNotifications,
  employeeBranding,
  employeeLocale,
  requireEmployee,
} from '@/lib/data/employee';

export const metadata: Metadata = {
  title: 'SauberWerk',
  manifest: '/mitarbeiter/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'SauberWerk' },
};

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
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
    <EmployeeShell locale={locale} branding={branding} unread={unread} userId={user.id} snapshot={snapshot}>
      {children}
    </EmployeeShell>
  );
}
