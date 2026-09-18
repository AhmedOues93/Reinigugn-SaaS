import { PortalShell } from '@/components/portal/portal-shell';
import { getPortalOverview, portalBranding, portalLocale } from '@/lib/data/portal';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const [locale, branding, overview] = await Promise.all([portalLocale(), portalBranding(), getPortalOverview()]);
  return (
    <PortalShell locale={locale} branding={branding} customerName={overview?.customerName ?? ''}>
      {children}
    </PortalShell>
  );
}
