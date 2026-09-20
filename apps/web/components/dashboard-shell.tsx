import Link from 'next/link';
import {
  BookOpen,
  Calculator,
  Bell,
  Building2,
  SlidersHorizontal,
  CalendarDays,
  CalendarOff,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  FileSignature,
  FileText,
  Inbox,
  LayoutDashboard,
  MessageSquare,
  MessageSquareWarning,
  Receipt,
  Settings,
  ShieldCheck,
  UserRoundCheck,
  Users,
} from 'lucide-react';
import { CompanyBrand } from '@/components/company-brand';
import { DashboardNav } from '@/components/dashboard-nav';
import { DashboardUserMenu } from '@/components/dashboard-user-menu';
import { GlobalSearch } from '@/components/global-search';
import { QuickCreateMenu } from '@/components/quick-create-menu';
import type { CompanyBranding } from '@/lib/data/branding';
import { direction, t, type Locale, type TranslationKey } from '@/lib/i18n';

export type NavGroup = { label: TranslationKey; items: { href: string; label: TranslationKey; icon: string }[] };

/**
 * Navigation grouped the way the office works through a week: win the work,
 * look after the customer, run the operation, get paid — with the things that
 * are set once and then referenced kept apart as Stammdaten.
 *
 * Every entry points at a route that already exists. Nothing was created to
 * fill out a heading: there is no separate payments screen because payments are
 * recorded against an invoice, and no reports screen because the product does
 * not have one yet. A nav item leading nowhere is worse than a missing one.
 *
 * The icon is a name rather than a component so this stays a server module.
 */
export const navGroups: NavGroup[] = [
  {
    label: 'nav.groupOverview',
    items: [
      { href: '/dashboard', label: 'nav.dashboard', icon: 'dashboard' },
      { href: '/dashboard/nachrichten', label: 'nav.messages', icon: 'messages' },
    ],
  },
  {
    label: 'nav.groupSales',
    items: [
      { href: '/dashboard/vertrieb/anfragen', label: 'nav.leads', icon: 'leads' },
      { href: '/dashboard/vertrieb/besichtigungen', label: 'nav.surveys', icon: 'surveys' },
      { href: '/dashboard/kalkulation', label: 'nav.calculation', icon: 'calculation' },
      { href: '/dashboard/vertrieb/angebote', label: 'nav.quotes', icon: 'quotes' },
      // Leistungspläne are the standing agreement behind the recurring visits,
      // which is what an office means by "Vertrag".
      { href: '/dashboard/planung/plaene', label: 'nav.contracts', icon: 'contracts' },
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
      { href: '/dashboard/checklisten', label: 'nav.checklists', icon: 'checklists' },
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
  {
    label: 'nav.groupMasterData',
    items: [
      { href: '/dashboard/mitarbeiter', label: 'nav.employees', icon: 'employees' },
      { href: '/dashboard/kalkulation/leistungskatalog', label: 'nav.catalog', icon: 'catalog' },
      { href: '/dashboard/kalkulation/grundlagen', label: 'nav.calculationBasics', icon: 'basics' },
    ],
  },
];

export const navIcons = {
  dashboard: LayoutDashboard,
  customers: Users,
  objects: Building2,
  planning: CalendarDays,
  jobs: ClipboardCheck,
  time: Clock3,
  records: FileText,
  checklists: ClipboardList,
  employees: UserRoundCheck,
  leave: CalendarOff,
  complaints: MessageSquareWarning,
  quality: ShieldCheck,
  billing: Receipt,
  leads: Inbox,
  surveys: ClipboardList,
  quotes: FileSignature,
  calculation: Calculator,
  contracts: FileSignature,
  catalog: BookOpen,
  basics: SlidersHorizontal,
  messages: MessageSquare,
  settings: Settings,
} as const;

export function DashboardShell({
  children,
  branding,
  companyName,
  email,
  displayName,
  role,
  locale,
  unreadNotifications,
}: {
  children: React.ReactNode;
  branding: Pick<CompanyBranding, 'name' | 'logoUrl'> | null;
  companyName: string;
  email: string;
  displayName?: string;
  role: 'OWNER' | 'OFFICE';
  locale: Locale;
  unreadNotifications: number;
}) {
  const accessKey: TranslationKey = role === 'OWNER' ? 'common.ownerAccess' : 'common.officeAccess';

  return (
    <div className="min-h-[100dvh] bg-background" dir={direction(locale)}>
      {/* Desktop rail on Tiefsee. A scrolling middle keeps the footer pinned. */}
      <aside className="surface-ink fixed inset-y-0 start-0 z-30 hidden w-[264px] flex-col lg:flex">
        <div className="flex shrink-0 items-center px-5 pb-4 pt-5 [&_img]:brightness-0 [&_img]:invert">
          <CompanyBrand branding={branding} href="/dashboard" className="text-white [&_span_span]:text-highlight" />
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-4 [scrollbar-color:hsl(var(--ink-line))_transparent] [scrollbar-width:thin]">
          <DashboardNav locale={locale} unread={unreadNotifications} />
        </div>
        <div className="shrink-0 border-t border-ink-line px-5 py-4">
          <p className="truncate text-sm font-medium text-white">{companyName}</p>
          <p className="mt-0.5 text-xs text-ink-muted">{t(locale, accessKey)}</p>
        </div>
      </aside>

      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/85 backdrop-blur-md lg:ms-[264px]">
        <div className="mx-auto flex h-16 w-full max-w-[1560px] items-center gap-2 px-4 sm:px-6 lg:px-8">
          <DashboardNav locale={locale} unread={unreadNotifications} mobile branding={branding} companyName={companyName} />
          <div className="min-w-0 lg:hidden [&_span]:block [&_span]:truncate">
            <CompanyBrand branding={branding} href="/dashboard" size="sm" className="min-w-0" />
          </div>

          {/* Search takes the width it needs and no more; it is a tool, not a
              headline, and a full-bleed field makes the bar look empty. */}
          <GlobalSearch locale={locale} className="hidden min-w-0 flex-1 md:block lg:max-w-[26rem]" />

          <div className="ms-auto flex items-center gap-1.5">
            <QuickCreateMenu />
            <Link
              href="/dashboard/nachrichten"
              className="relative grid size-10 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground max-md:size-touch"
              aria-label={
                unreadNotifications > 0
                  ? `${t(locale, 'nav.messages')} (${unreadNotifications})`
                  : t(locale, 'nav.messages')
              }
            >
              <Bell className="size-[18px]" aria-hidden="true" />
              {unreadNotifications > 0 && (
                <span className="absolute end-1.5 top-1.5 grid min-w-[1.05rem] place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-4 text-white ring-2 ring-background">
                  {unreadNotifications > 9 ? '9+' : unreadNotifications}
                </span>
              )}
            </Link>
            <DashboardUserMenu locale={locale} email={email} displayName={displayName} companyName={companyName} />
          </div>
        </div>
      </header>

      <main className="lg:ms-[264px]">
        <div className="mx-auto w-full max-w-[1560px] px-4 pb-16 pt-6 sm:px-6 lg:px-8 lg:pt-7">{children}</div>
      </main>
    </div>
  );
}
