import type { Metadata, Viewport } from 'next';
import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard-shell';
import { PwaHead } from '@/components/pwa-head';
import { getCurrentCompany } from '@/lib/auth';
import { getCompanyBranding } from '@/lib/data/branding';
import { type Locale } from '@/lib/i18n';
import { landingPathForRole } from '@/lib/landing';
import { cookieLocale } from '@/lib/i18n-server';

/**
 * The office app is installable in its own right, with its own manifest, its
 * own scope and its own tile. Someone who works in the office should be able to
 * put it on a home screen next to — and tell it apart from — the field app.
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

/* Tiefsee, the colour of the office rail. */
export const viewport: Viewport = { themeColor: '#0F1F21' };

const officePwa = {
  manifest: '/dashboard/manifest.webmanifest',
  icon: '/icons/admin-icon-192.png',
  appleIcon: '/icons/admin-apple-touch-180.png',
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, membership, supabase, profile } = await getCurrentCompany();
  if (!membership) redirect('/onboarding');
  const company = membership.companies as unknown as { name: string } | null;
  if (!company) redirect('/onboarding');
  // The dashboard is staff only: employees have the mobile app, customers the portal.
  if (membership.role !== 'OWNER' && membership.role !== 'OFFICE') redirect(landingPathForRole(membership.role));

  const storedLocale = await cookieLocale();
  const locale: Locale = storedLocale ?? 'de';
  const [branding, { count: unreadNotifications }, { count: unreadComplaints }] = await Promise.all([
    getCompanyBranding(membership.company_id),
    supabase
      .from('in_app_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_member_id', membership.id)
      .is('read_at', null),
    supabase
      .from('in_app_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_member_id', membership.id)
      .eq('type', 'COMPLAINT_CREATED')
      .is('read_at', null),
  ]);

  return (
    <>
      <PwaHead {...officePwa} />
      <DashboardShell
        branding={branding}
        companyName={company.name}
        email={user.email ?? 'Konto'}
        displayName={[profile?.first_name, profile?.last_name].filter(Boolean).join(' ')}
        role={membership.role as 'OWNER' | 'OFFICE'}
        locale={locale}
        unreadNotifications={unreadNotifications ?? 0}
        unreadComplaints={unreadComplaints ?? 0}
      >
        {children}
      </DashboardShell>
    </>
  );
}
