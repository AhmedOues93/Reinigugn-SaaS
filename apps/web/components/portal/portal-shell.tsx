import { CompanyBrand } from '@/components/company-brand';
import { SyncDocumentLocale } from '@/components/sync-document-locale';
import { PortalNav } from '@/components/portal/portal-nav';
import { PortalAccountMenu } from '@/components/portal/account-menu';
import type { CompanyBranding } from '@/lib/data/branding';
import { direction, type Locale } from '@/lib/i18n';

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

      <header className="sticky top-0 z-20 border-b border-border bg-card/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center gap-3 px-4">
          <CompanyBrand branding={branding} href="/portal" size="sm" />
          <div className="ms-auto flex items-center gap-2">
            <span className="hidden max-w-56 truncate text-sm text-muted-foreground sm:block">{customerName}</span>
            <PortalAccountMenu locale={locale} email={email} customerName={customerName} />
          </div>
        </div>
        <div className="mx-auto hidden w-full max-w-5xl px-2 sm:block">
          <PortalNav locale={locale} variant="top" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-5 sm:pb-10">{children}</main>

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
    <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-balance text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm leading-6 text-muted-foreground">{subtitle}</p>}
      </div>
      {actions}
    </header>
  );
}

export { EmptyState as PortalEmptyState } from '@/components/ui';
