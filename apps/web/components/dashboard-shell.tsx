import Link from 'next/link';
import {
  Bell,
  Building2,
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  FileText,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Receipt,
  Settings,
  UserRoundCheck,
  Users,
} from 'lucide-react';
import { logout } from '@/app/(auth)/actions';
import { CompanyBrand } from '@/components/company-brand';
import { LanguageSelector } from '@/components/language-selector';
import type { CompanyBranding } from '@/lib/data/branding';
import { direction, t, type Locale, type TranslationKey } from '@/lib/i18n';

const navigation: { href: string; label: TranslationKey; icon: typeof LayoutDashboard }[] = [
  { href: '/dashboard', label: 'nav.dashboard', icon: LayoutDashboard },
  { href: '/dashboard/kunden', label: 'nav.customers', icon: Users },
  { href: '/dashboard/objekte', label: 'nav.objects', icon: Building2 },
  { href: '/dashboard/mitarbeiter', label: 'nav.employees', icon: UserRoundCheck },
  { href: '/dashboard/planung', label: 'nav.planning', icon: CalendarDays },
  { href: '/dashboard/auftraege', label: 'nav.jobs', icon: ClipboardCheck },
  { href: '/dashboard/arbeitszeiten', label: 'nav.time', icon: Clock3 },
  { href: '/dashboard/urlaub-krankheit', label: 'nav.leave', icon: CalendarDays },
  { href: '/dashboard/reklamationen', label: 'nav.complaints', icon: Bell },
  { href: '/dashboard/qualitaetskontrolle', label: 'nav.quality', icon: ClipboardCheck },
  { href: '/dashboard/nachrichten', label: 'nav.messages', icon: MessageSquare },
  { href: '/dashboard/leistungsnachweise', label: 'nav.serviceRecords', icon: FileText },
  { href: '/dashboard/abrechnung', label: 'nav.billing', icon: Receipt },
  { href: '/dashboard/settings', label: 'nav.settings', icon: Settings },
];

function Navigation({ locale }: { locale: Locale }) {
  return (
    <nav className="space-y-1" aria-label={t(locale, 'common.menu')}>
      {navigation.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className="flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Icon className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{t(locale, label)}</span>
        </Link>
      ))}
    </nav>
  );
}

export function DashboardShell({
  children,
  branding,
  companyName,
  email,
  role,
  locale,
  unreadNotifications,
}: {
  children: React.ReactNode;
  branding: Pick<CompanyBranding, 'name' | 'logoUrl'> | null;
  companyName: string;
  email: string;
  role: 'OWNER' | 'OFFICE';
  locale: Locale;
  unreadNotifications: number;
}) {
  const access = role === 'OWNER' ? 'common.ownerAccess' : 'common.officeAccess';

  return (
    <div className="min-h-screen bg-slate-50" dir={direction(locale)}>
      <aside className="fixed inset-y-0 hidden w-64 flex-col border-e bg-white p-4 lg:flex">
        <div className="mb-8 px-2">
          <CompanyBrand branding={branding} href="/dashboard" />
        </div>
        <div className="flex-1 overflow-y-auto">
          <Navigation locale={locale} />
        </div>
        <div className="mt-4 rounded-md bg-slate-50 p-3 text-xs text-slate-500">
          <p className="truncate font-medium text-slate-700">{companyName}</p>
          <p className="mt-1">{t(locale, access)}</p>
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b bg-white px-4 lg:ms-64 lg:px-8">
        {/* Mobile drawer. `group` + `open:` keeps it CSS-only, but the panel is now
            anchored to the viewport so it can never be clipped by the header. */}
        <details className="group lg:hidden">
          <summary
            className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-md hover:bg-slate-100"
            aria-label={t(locale, 'common.menu')}
          >
            <Menu className="size-5" aria-hidden="true" />
          </summary>
          <div className="fixed inset-x-0 bottom-0 top-16 z-40 overflow-y-auto border-t bg-white p-4 shadow-lg">
            <Navigation locale={locale} />
          </div>
        </details>

        <div className="hidden items-center gap-2 text-sm text-slate-600 lg:flex">
          <span className="truncate">{companyName}</span>
        </div>
        <div className="lg:hidden">
          <CompanyBrand branding={branding} href="/dashboard" size="sm" />
        </div>

        <Link
          href="/dashboard/nachrichten"
          className="relative ms-auto grid min-h-11 min-w-11 place-items-center rounded-md hover:bg-slate-100"
          aria-label={t(locale, 'nav.messages')}
        >
          <Bell className="size-5" aria-hidden="true" />
          {unreadNotifications > 0 && (
            <span className="absolute end-1.5 top-1.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] leading-4 text-white">
              {unreadNotifications > 9 ? '9+' : unreadNotifications}
            </span>
          )}
        </Link>

        <details className="relative">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md px-2 text-sm hover:bg-slate-100">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 font-semibold text-primary">
              {email.slice(0, 1).toUpperCase()}
            </span>
            <span className="hidden max-w-48 truncate sm:block">{email}</span>
            <ChevronDown className="size-4 shrink-0 text-slate-500" aria-hidden="true" />
          </summary>
          {/* Anchored to the trailing edge and width-capped, so the popover stays
              on screen in both LTR and RTL instead of overflowing the viewport. */}
          <div className="absolute end-0 z-40 mt-2 w-60 max-w-[calc(100vw-2rem)] rounded-md border bg-white p-1 shadow-lg">
            <LanguageSelector locale={locale} />
            <Link className="block min-h-11 rounded px-3 py-2.5 text-sm hover:bg-slate-50" href="/dashboard/settings">
              {t(locale, 'common.settings')}
            </Link>
            <form action={logout}>
              <button className="min-h-11 w-full rounded px-3 py-2.5 text-start text-sm hover:bg-slate-50" type="submit">
                {t(locale, 'common.logout')}
              </button>
            </form>
          </div>
        </details>
      </header>

      <main className="p-4 sm:p-6 lg:ms-64 lg:p-8">{children}</main>
    </div>
  );
}
