import { CompanyBrand } from '@/components/company-brand';
import { SyncDocumentLocale } from '@/components/sync-document-locale';
import { PortalNav } from '@/components/portal/portal-nav';
import { PortalAccountMenu } from '@/components/portal/account-menu';
import type { CompanyBranding } from '@/lib/data/branding';
import { direction, t, type Locale } from '@/lib/i18n';

/**
 * Portal frame. One navigation component renders as a bottom tab bar on phones
 * and a tab row from `sm` upwards, so there is no second mobile layout to keep
 * in step. `pb-28` on small screens reserves space for the fixed bar.
 */
export function PortalShell({
  children,
  branding,
  locale,
  customerName,
  email,
}: {
  children: React.ReactNode;
  branding: Pick<CompanyBranding, 'name' | 'logoUrl'> | null;
  locale: Locale;
  customerName: string;
  email: string;
}) {
  return (
    <div dir={direction(locale)} className="flex min-h-[100dvh] flex-col bg-background">
      <SyncDocumentLocale locale={locale} />

      <header className="sticky top-0 z-20 border-b border-border/70 bg-card/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center gap-3 px-4 sm:px-6">
          <CompanyBrand branding={branding} href="/portal" size="sm" />
          <span className="hidden border-s border-border ps-3 text-sm text-muted-foreground sm:block">{t(locale, 'portal.appName')}</span>
          <div className="ms-auto flex items-center gap-2">
            <span className="hidden max-w-56 truncate text-sm font-medium sm:block">{customerName}</span>
            <PortalAccountMenu locale={locale} email={email} customerName={customerName} />
          </div>
        </div>
        <div className="mx-auto hidden w-full max-w-5xl px-3 sm:block sm:px-4">
          <PortalNav locale={locale} variant="top" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-6 sm:px-6 sm:pb-14 sm:pt-8">{children}</main>

      <div className="sm:hidden">
        <PortalNav locale={locale} variant="bottom" />
      </div>
    </div>
  );
}

export function PortalPageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-balance text-[1.6rem] font-semibold leading-tight sm:text-[1.85rem]">{title}</h1>
        {subtitle && <p className="mt-1.5 text-[15px] leading-6 text-muted-foreground">{subtitle}</p>}
      </div>
      {actions}
    </header>
  );
}

export { EmptyState as PortalEmptyState } from '@/components/ui';
