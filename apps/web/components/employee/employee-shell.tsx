import { CompanyBrand } from '@/components/company-brand';
import { SyncDocumentLocale } from '@/components/sync-document-locale';
import { EmployeeBottomNav } from '@/components/employee/bottom-nav';
import type { CompanyBranding } from '@/lib/data/branding';
import { direction, type Locale } from '@/lib/i18n';

/**
 * Mobile application frame. A compact branded header, a single content column
 * capped at phone width, and a persistent tab bar. `pb-28` reserves room for the
 * fixed bar so the last card is never hidden behind it, and safe-area insets keep
 * it clear of the notch and the home indicator.
 */
export function EmployeeShell({
  children,
  branding,
  locale,
  unread,
}: {
  children: React.ReactNode;
  branding: Pick<CompanyBranding, 'name' | 'logoUrl'> | null;
  locale: Locale;
  unread: number;
}) {
  return (
    <div dir={direction(locale)} className="flex min-h-[100dvh] flex-col bg-background">
      <SyncDocumentLocale locale={locale} />
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-lg items-center gap-3 px-4">
          <CompanyBrand branding={branding} href="/mitarbeiter" size="sm" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-28 pt-4">{children}</main>

      <EmployeeBottomNav locale={locale} unread={unread} />
    </div>
  );
}

export function EmployeePageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h1 className="text-balance text-xl font-semibold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

export { EmptyState } from '@/components/ui';
