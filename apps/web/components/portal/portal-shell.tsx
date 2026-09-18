import { CompanyBrand } from '@/components/company-brand';
import { LanguageSelector } from '@/components/language-selector';
import { PortalNav } from '@/components/portal/portal-nav';
import { logout } from '@/app/(auth)/actions';
import type { CompanyBranding } from '@/lib/data/branding';
import { direction, t, type Locale } from '@/lib/i18n';

/**
 * Portal frame. The same navigation renders as a bottom tab bar on phones and as
 * a horizontal bar under the header from `sm` upwards, so one component covers
 * both without a separate mobile layout.
 */
export function PortalShell({
  children,
  branding,
  locale,
  customerName,
}: {
  children: React.ReactNode;
  branding: Pick<CompanyBranding, 'name' | 'logoUrl'> | null;
  locale: Locale;
  customerName: string;
}) {
  return (
    <div dir={direction(locale)} className="flex min-h-[100dvh] flex-col bg-slate-50">
      <header className="sticky top-0 z-20 border-b bg-white pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-16 w-full max-w-4xl items-center gap-3 px-4">
          <CompanyBrand branding={branding} href="/portal" size="sm" />
          <div className="ms-auto flex items-center gap-1">
            <span className="hidden max-w-48 truncate text-sm text-slate-600 sm:block">{customerName}</span>
            <details className="relative">
              <summary
                className="grid min-h-11 min-w-11 cursor-pointer list-none place-items-center rounded-md text-sm hover:bg-slate-100"
                aria-label={t(locale, 'portal.profile.title')}
              >
                <span className="grid size-8 place-items-center rounded-full bg-primary/10 font-semibold text-primary">
                  {customerName.slice(0, 1).toUpperCase()}
                </span>
              </summary>
              <div className="absolute end-0 z-40 mt-2 w-60 max-w-[calc(100vw-2rem)] rounded-md border bg-white p-1 shadow-lg">
                <LanguageSelector locale={locale} />
                <form action={logout}>
                  <button className="min-h-11 w-full rounded px-3 py-2.5 text-start text-sm hover:bg-slate-50" type="submit">
                    {t(locale, 'common.logout')}
                  </button>
                </form>
              </div>
            </details>
          </div>
        </div>
        <div className="mx-auto hidden w-full max-w-4xl px-2 sm:block">
          <PortalNav locale={locale} variant="top" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 pb-24 pt-5 sm:pb-8">{children}</main>

      <div className="sm:hidden">
        <PortalNav locale={locale} variant="bottom" />
      </div>
    </div>
  );
}

export function PortalPageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-5">
      <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
    </div>
  );
}

export function PortalEmptyState({ title, body, icon }: { title: string; body?: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
      {icon && <div className="mx-auto mb-3 grid size-10 place-items-center rounded-full bg-slate-100 text-slate-500">{icon}</div>}
      <p className="font-medium text-slate-900">{title}</p>
      {body && <p className="mx-auto mt-1 max-w-sm text-sm text-slate-600">{body}</p>}
    </div>
  );
}
