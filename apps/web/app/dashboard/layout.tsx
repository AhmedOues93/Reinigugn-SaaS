import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard-shell';
import { getCurrentCompany } from '@/lib/auth';
import { isLocale, type Locale } from '@/lib/i18n';
import { cookieLocale } from '@/lib/i18n-server';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, membership, profile, supabase } = await getCurrentCompany();
  if (!membership) redirect('/onboarding');
  const company = membership.companies as unknown as { name: string } | null;
  if (!company) redirect('/onboarding');
  const storedLocale = await cookieLocale();
  let locale: Locale = storedLocale ?? 'de';
  if (!storedLocale && membership.role === 'EMPLOYEE' && profile) {
    const { data } = await supabase.from('employee_details').select('preferred_language').eq('company_id', membership.company_id).eq('profile_id', profile.id).maybeSingle();
    if (isLocale(data?.preferred_language)) locale = data.preferred_language;
  }
  const { count: unreadNotifications } = await supabase.from('in_app_notifications').select('*', { count: 'exact', head: true }).eq('recipient_member_id', membership.id).is('read_at', null);
  return <DashboardShell companyName={company.name} email={user.email ?? 'Konto'} role={membership.role as 'OWNER' | 'OFFICE' | 'EMPLOYEE'} locale={locale} unreadNotifications={unreadNotifications ?? 0}>{children}</DashboardShell>;
}
