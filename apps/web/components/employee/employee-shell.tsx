import { CompanyBrand } from '@/components/company-brand';
import { SyncDocumentLocale } from '@/components/sync-document-locale';
import { EmployeeBottomNav, EmployeeTopNav } from '@/components/employee/bottom-nav';
import { OfflineProvider } from '@/components/employee/offline-provider';
import { SyncBanner, SyncStatus } from '@/components/employee/sync-status';
import type { CachedSnapshot } from '@/lib/offline/store';
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
  userId,
  snapshot,
}: {
  children: React.ReactNode;
  branding: Pick<CompanyBranding, 'name' | 'logoUrl'> | null;
  locale: Locale;
  unread: number;
  userId: string;
  snapshot: CachedSnapshot | null;
}) {
  return (
    <OfflineProvider userId={userId} snapshot={snapshot}>
      <div dir={direction(locale)} className="flex min-h-[100dvh] flex-col bg-background">
        <SyncDocumentLocale locale={locale} />

        <header className="sticky top-0 z-20 bg-ink pt-[env(safe-area-inset-top)] text-ink-foreground shadow-[0_1px_0_0_hsl(var(--ink-line))]">
          <div className="mx-auto flex h-14 w-full max-w-lg items-center gap-4 px-4 md:h-16 md:gap-6 md:max-w-3xl lg:max-w-5xl [&_img]:brightness-0 [&_img]:invert">
            <CompanyBrand branding={branding} href="/mitarbeiter" size="sm" className="text-white [&_span_span]:text-highlight" />
            <EmployeeTopNav locale={locale} unread={unread} />
            <div className="ms-auto md:ms-0">
              <SyncStatus locale={locale} />
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-5 md:max-w-3xl md:pb-12 md:pt-8 lg:max-w-5xl">
          <SyncBanner locale={locale} />
          {children}
        </main>

        <EmployeeBottomNav locale={locale} unread={unread} />
      </div>
    </OfflineProvider>
  );
}

export function EmployeePageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4 md:mb-6">
      <h1 className="text-balance text-[1.6rem] font-semibold leading-tight">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

export { EmptyState } from '@/components/ui';
