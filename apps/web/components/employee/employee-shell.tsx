import { CompanyBrand } from '@/components/company-brand';
import { EmployeeBottomNav } from '@/components/employee/bottom-nav';
import type { CompanyBranding } from '@/lib/data/branding';
import { direction, type Locale } from '@/lib/i18n';

/**
 * Mobile-first application frame: a compact branded header, a scrolling content
 * column capped at phone width, and the bottom tab bar. The dashboard sidebar is
 * deliberately absent — this is an app, not a dashboard on a small screen.
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
    <div dir={direction(locale)} className="flex min-h-[100dvh] flex-col bg-slate-50">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 w-full max-w-lg items-center gap-3 px-4">
          <CompanyBrand branding={branding} href="/mitarbeiter" size="sm" />
        </div>
      </header>
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-24 pt-4">{children}</main>
      <EmployeeBottomNav locale={locale} unread={unread} />
    </div>
  );
}

/** Page heading used by every employee screen so spacing stays consistent. */
export function EmployeePageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h1 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
    </div>
  );
}

/** Shared empty state so "nothing here" never looks like a failed page. */
export function EmptyState({ title, body, icon }: { title: string; body?: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
      {icon && <div className="mx-auto mb-3 grid size-10 place-items-center rounded-full bg-slate-100 text-slate-500">{icon}</div>}
      <p className="font-medium text-slate-900">{title}</p>
      {body && <p className="mx-auto mt-1 max-w-xs text-sm text-slate-600">{body}</p>}
    </div>
  );
}
