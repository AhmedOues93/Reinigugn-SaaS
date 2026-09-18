import Link from 'next/link';
import {
  Bell,
  Building2,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  FileSignature,
  FileText,
  LayoutDashboard,
  MessageSquare,
  Receipt,
  Settings,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
  Users,
} from 'lucide-react';
import { CompanyBrand } from '@/components/company-brand';
import { DashboardNav } from '@/components/dashboard-nav';
import { DashboardUserMenu } from '@/components/dashboard-user-menu';
import type { CompanyBranding } from '@/lib/data/branding';
import { direction, t, type Locale, type TranslationKey } from '@/lib/i18n';

export type NavGroup = { label: TranslationKey; items: { href: string; label: TranslationKey; icon: string }[] };

/**
 * Navigation grouped by what the office actually does, instead of one flat list
 * of fourteen links. The icon is a name rather than a component so this stays a
 * server module and the client nav can resolve it.
 */
export const navGroups: NavGroup[] = [
  { label: 'nav.groupOverview', items: [{ href: '/dashboard', label: 'nav.dashboard', icon: 'dashboard' }] },
  {
    label: 'nav.groupSales',
    items: [
      { href: '/dashboard/vertrieb/anfragen', label: 'nav.leads', icon: 'leads' },
      { href: '/dashboard/vertrieb/besichtigungen', label: 'nav.surveys', icon: 'surveys' },
      { href: '/dashboard/vertrieb/angebote', label: 'nav.quotes', icon: 'quotes' },
    ],
  },
  {
    label: 'nav.groupCustomers',
    items: [
      { href: '/dashboard/kunden', label: 'nav.customers', icon: 'customers' },
      { href: '/dashboard/objekte', label: 'nav.objects', icon: 'objects' },
    ],
  },
  {
    label: 'nav.groupOperations',
    items: [
      { href: '/dashboard/planung', label: 'nav.planning', icon: 'planning' },
      { href: '/dashboard/auftraege', label: 'nav.jobs', icon: 'jobs' },
      { href: '/dashboard/arbeitszeiten', label: 'nav.time', icon: 'time' },
      { href: '/dashboard/leistungsnachweise', label: 'nav.serviceRecords', icon: 'records' },
    ],
  },
  {
    label: 'nav.groupTeam',
    items: [
      { href: '/dashboard/mitarbeiter', label: 'nav.employees', icon: 'employees' },
      { href: '/dashboard/urlaub-krankheit', label: 'nav.leave', icon: 'leave' },
    ],
  },
  {
    label: 'nav.groupQuality',
    items: [
      { href: '/dashboard/reklamationen', label: 'nav.complaints', icon: 'complaints' },
      { href: '/dashboard/qualitaetskontrolle', label: 'nav.quality', icon: 'quality' },
    ],
  },
  { label: 'nav.groupFinance', items: [{ href: '/dashboard/abrechnung', label: 'nav.billing', icon: 'billing' }] },
];

export const navIcons = {
  dashboard: LayoutDashboard,
  customers: Users,
  objects: Building2,
  planning: CalendarDays,
  jobs: ClipboardCheck,
  time: Clock3,
  records: FileText,
  employees: UserRoundCheck,
  leave: CalendarDays,
  complaints: Bell,
  quality: ShieldCheck,
  billing: Receipt,
  leads: Sparkles,
  surveys: ClipboardList,
  quotes: FileSignature,
  messages: MessageSquare,
  settings: Settings,
} as const;

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
  const accessKey: TranslationKey = role === 'OWNER' ? 'common.ownerAccess' : 'common.officeAccess';

  return (
    <div className="min-h-[100dvh] bg-background" dir={direction(locale)}>
      {/* Desktop rail. `flex-col` with a scrolling middle keeps the footer pinned
          without absolute positioning, so it cannot collide with the nav. */}
      <aside className="fixed inset-y-0 z-30 hidden w-64 flex-col border-e border-border bg-card lg:flex">
        <div className="flex h-16 shrink-0 items-center border-b border-border px-5">
          <CompanyBrand branding={branding} href="/dashboard" />
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <DashboardNav locale={locale} />
        </div>
        <div className="shrink-0 border-t border-border p-3">
          <div className="rounded-md bg-muted px-3 py-2.5">
            <p className="truncate text-sm font-medium">{companyName}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t(locale, accessKey)}</p>
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-border bg-card/95 px-4 backdrop-blur lg:ms-64 lg:px-8">
        <DashboardNav locale={locale} mobile />
        <div className="lg:hidden">
          <CompanyBrand branding={branding} href="/dashboard" size="sm" />
        </div>
        <p className="hidden truncate text-sm text-muted-foreground lg:block">{companyName}</p>

        <Link
          href="/dashboard/nachrichten"
          className="relative ms-auto grid min-h-touch min-w-touch place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={t(locale, 'nav.messages')}
        >
          <Bell className="size-5" aria-hidden="true" />
          {unreadNotifications > 0 && (
            <span className="absolute end-1.5 top-1.5 grid min-w-[1.1rem] place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-4 text-white">
              {unreadNotifications > 9 ? '9+' : unreadNotifications}
            </span>
          )}
        </Link>

        <DashboardUserMenu locale={locale} email={email} />
      </header>

      <main className="lg:ms-64">
        <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
