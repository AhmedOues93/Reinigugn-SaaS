import { CompanyBrand } from '@/components/company-brand';
import { SyncDocumentLocale } from '@/components/sync-document-locale';
import { EmployeeBottomNav, EmployeeTopNav } from '@/components/employee/bottom-nav';
import type { CompanyBranding } from '@/lib/data/branding';
import { direction, type Locale } from '@/lib/i18n';

/**
 * Responsive employee frame.
 *
 * Phone (<md): single column capped at phone width with the fixed bottom tab
 * bar. `main` reserves `7rem + env(safe-area-inset-bottom)` at the bottom, which
 * is more than the bar can ever occupy (60px of tabs plus the home-indicator
 * inset), so the last control always scrolls clear of it.
 *
 * Tablet and desktop (md+): the tab bar is replaced by a horizontal nav in the
 * header and the column widens. Same routes and same functionality — only the
 * shape changes, rather than stretching a phone UI across a large screen.
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
        <div className="mx-auto flex h-14 w-full max-w-lg items-center gap-6 px-4 md:h-16 md:max-w-3xl lg:max-w-5xl">
          <CompanyBrand branding={branding} href="/mitarbeiter" size="sm" />
          <EmployeeTopNav locale={locale} unread={unread} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-4 md:max-w-3xl md:pb-10 md:pt-6 lg:max-w-5xl">
        {children}
      </main>

      <EmployeeBottomNav locale={locale} unread={unread} />
    </div>
  );
}

export function EmployeePageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4 md:mb-6">
      <h1 className="text-balance text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

export { EmptyState } from '@/components/ui';
