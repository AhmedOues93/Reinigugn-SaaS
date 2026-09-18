import type { Metadata } from 'next';
import { EmployeeShell } from '@/components/employee/employee-shell';
import { countMyUnreadNotifications, employeeBranding, employeeLocale } from '@/lib/data/employee';

export const metadata: Metadata = {
  title: 'SauberWerk',
  manifest: '/mitarbeiter/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'SauberWerk' },
};

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const [locale, branding, unread] = await Promise.all([employeeLocale(), employeeBranding(), countMyUnreadNotifications()]);
  return (
    <EmployeeShell locale={locale} branding={branding} unread={unread}>
      {children}
    </EmployeeShell>
  );
}
