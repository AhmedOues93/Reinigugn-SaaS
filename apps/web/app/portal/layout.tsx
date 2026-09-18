import { PortalShell } from '@/components/portal/portal-shell';
import { getPortalOverview, portalBranding, portalLocale, requirePortalCustomer } from '@/lib/data/portal';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const [{ user }, locale, branding, overview] = await Promise.all([
    requirePortalCustomer(),
    portalLocale(),
    portalBranding(),
    getPortalOverview(),
  ]);
  return (
    <PortalShell
      locale={locale}
      branding={branding}
      customerName={overview?.customerName ?? ''}
      email={user.email ?? ''}
    >
      {children}
    </PortalShell>
  );
}
