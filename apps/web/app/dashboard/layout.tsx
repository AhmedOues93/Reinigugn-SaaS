import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard-shell';
import { getCurrentCompany } from '@/lib/auth';
import { getCompanyBranding } from '@/lib/data/branding';
import { type Locale } from '@/lib/i18n';
import { cookieLocale } from '@/lib/i18n-server';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, membership, supabase } = await getCurrentCompany();
  if (!membership) redirect('/onboarding');
  const company = membership.companies as unknown as { name: string } | null;
  if (!company) redirect('/onboarding');
  // Employees have their own mobile application; the dashboard is staff only.
  if (membership.role === 'EMPLOYEE') redirect('/mitarbeiter');

  const storedLocale = await cookieLocale();
  const locale: Locale = storedLocale ?? 'de';
  const [branding, { count: unreadNotifications }] = await Promise.all([
    getCompanyBranding(membership.company_id),
    supabase
      .from('in_app_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_member_id', membership.id)
      .is('read_at', null),
  ]);

  return (
    <DashboardShell
      branding={branding}
      companyName={company.name}
      email={user.email ?? 'Konto'}
      role={membership.role as 'OWNER' | 'OFFICE'}
      locale={locale}
      unreadNotifications={unreadNotifications ?? 0}
    >
      {children}
    </DashboardShell>
  );
}
