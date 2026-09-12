import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard-shell';
import { getCurrentCompany } from '@/lib/auth';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, membership } = await getCurrentCompany();
  if (!membership) redirect('/onboarding');
  const company = membership.companies as unknown as { name: string } | null;
  if (!company) redirect('/onboarding');
  return <DashboardShell companyName={company.name} email={user.email ?? 'Konto'} role={membership.role as 'OWNER' | 'OFFICE' | 'EMPLOYEE'}>{children}</DashboardShell>;
}
