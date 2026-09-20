import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ArrowRight,
  Building2,
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  ClipboardCheck,
  FileSignature,
  FileText,
  Inbox,
  Receipt,
  TrendingUp,
  UserPlus,
  Users,
  UserRoundCheck,
} from 'lucide-react';
import { cn } from '@reinigung/ui';
import {
  ButtonLink,
  CardLink,
  EmptyState,
  QuickAction,
  SectionCard,
  StatCard,
} from '@/components/ui';
import { RevenueBars, StatusDonut } from '@/components/charts';
import { OfficeActionPanel } from '@/components/dashboard/action-items';
import { getOnboardingStatus, shouldRunOnboarding } from '@/lib/data/onboarding';
import { landingPathForRole } from '@/lib/landing';
import { getCurrentCompany } from '@/lib/auth';
import { getBillingSummary, getMonthlyRevenue, getOfficeActionItems } from '@/lib/data/billing';
import { getJobStatusDistribution, listTodayBoard } from '@/lib/data/jobs';
import { getPortfolioCounts, getQualitySummary, getRecentActivity } from '@/lib/data/dashboard';
import { BrandBackdrop } from '@/components/brand-backdrop';
import { brandImage } from '@/lib/brand-assets';
import { formatDate, formatMoney, formatMoneyCompact, formatTimeRange } from '@/lib/format';
import { berlinDateKey } from '@/lib/date';
import { t, type Locale } from '@/lib/i18n';
import { currentLocale } from '@/lib/i18n-server';

function first<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

/** Greets by the clock in Berlin, which is where the working day is. */
function greetingKey(hour: number) {
  if (hour < 11) return 'dashboard.goodMorning' as const;
  if (hour < 18) return 'dashboard.goodDay' as const;
  return 'dashboard.goodEvening' as const;
}

const activityIcons = {
  QUOTE: FileSignature,
  CUSTOMER: Users,
  JOB: ClipboardCheck,
  INVOICE: Receipt,
} as const;

/**
 * The office dashboard.
 *
 * Read top-left to bottom-right it answers four questions in order: how big is
 * the business, how is it earning, what is happening today, and what needs a
 * decision. The right column is the one that changes hour to hour, which is why
 * it sits where the eye lands after the headline.
 *
 * Every figure comes from a table. Where a company has no data yet the panel
 * says so — an invented number on a dashboard is worse than a missing one,
 * because somebody will plan around it.
 */
export default async function DashboardPage() {
  const { membership, profile } = await getCurrentCompany();
  if (membership && membership.role !== 'OWNER' && membership.role !== 'OFFICE') {
    redirect(landingPathForRole(membership.role));
  }

  /*
   * A brand-new company lands in the setup wizard rather than on an empty
   * dashboard. Once, and only for the OWNER: an OFFICE colleague joining an
   * established company has no business in somebody else's company setup.
   */
  if (membership?.role === 'OWNER') {
    const onboarding = await getOnboardingStatus();
    if (shouldRunOnboarding(onboarding, membership.role)) redirect('/dashboard/einrichtung');
  }

  const year = new Date().getFullYear();
  const [portfolio, revenue, board, jobStatus, billing, actions, activity, quality, locale] =
    await Promise.all([
      getPortfolioCounts(),
      getMonthlyRevenue(year),
      listTodayBoard(),
      getJobStatusDistribution(),
      getBillingSummary(),
      getOfficeActionItems(),
      getRecentActivity(5),
      getQualitySummary(),
      currentLocale(),
    ]);

  const firstName = profile?.first_name || '';
  const hour = Number(
    new Intl.DateTimeFormat('de-DE', { hour: 'numeric', hour12: false, timeZone: 'Europe/Berlin' }).format(new Date()),
  );
  const money = (cents: number) => formatMoney(locale, cents);
  const monthNames = monthLabels(locale);

  return (
    <div className="space-y-6">
      {/* --- Greeting ------------------------------------------------------ */}
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <h1 className="text-[1.6rem] font-semibold leading-tight tracking-tight sm:text-[1.9rem]">
            {firstName
              ? t(locale, greetingKey(hour), { name: firstName })
              : t(locale, 'dashboard.subtitle')}
          </h1>
          <p className="mt-1 text-[15px] text-muted-foreground">{t(locale, 'dashboard.subtitle')}</p>
        </div>
        <p className="shrink-0 pt-1 text-sm text-muted-foreground">
          {formatDate(locale, berlinDateKey(), 'long')}
        </p>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* ================= main column ================= */}
        <div className="min-w-0 space-y-5">
          {/* --- A. What the company looks after --------------------------- */}
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label={t(locale, 'dashboard.activeCustomers')}
              value={portfolio.customers}
              href="/dashboard/kunden"
              icon={<Users />}
              tone="primary"
              note={
                portfolio.customersThisMonth > 0
                  ? t(locale, 'dashboard.newThisMonth', { count: portfolio.customersThisMonth })
                  : undefined
              }
            />
            <StatCard
              label={t(locale, 'nav.objects')}
              value={portfolio.objects}
              href="/dashboard/objekte"
              icon={<Building2 />}
              tone="info"
              note={
                portfolio.objectsThisMonth > 0
                  ? t(locale, 'dashboard.newThisMonth', { count: portfolio.objectsThisMonth })
                  : undefined
              }
            />
            <StatCard
              label={t(locale, 'nav.employees')}
              value={portfolio.employees}
              href="/dashboard/mitarbeiter"
              icon={<UserRoundCheck />}
              tone="success"
              note={t(locale, 'dashboard.activeInField')}
            />
          </div>

          {/* --- B. Revenue and today, side by side ------------------------ */}
          <div className="grid gap-5 lg:grid-cols-2">
            <SectionCard
              title={t(locale, 'dashboard.revenueTrend')}
              action={<span className="text-[13px] font-medium tabular-nums text-muted-foreground">{year}</span>}
            >
              <RevenueBars
                data={revenue.map((point) => ({
                  label: monthNames.short[point.month - 1],
                  fullLabel: monthNames.long[point.month - 1],
                  cents: point.cents,
                }))}
                formatValue={(cents) => formatMoneyCompact(locale, cents)}
                emptyLabel={t(locale, 'dashboard.noRevenueYet', { year })}
              />
              <p className="mt-3 border-t border-border/70 pt-3 text-xs leading-5 text-muted-foreground">
                {t(locale, 'dashboard.revenueBasis')}
              </p>
            </SectionCard>

            <SectionCard
              title={t(locale, 'dashboard.todayBoard')}
              action={<CardLink href="/dashboard/auftraege">{t(locale, 'dashboard.viewAll')}</CardLink>}
              flush
            >
              {board.length === 0 ? (
                <p className="px-5 pb-6 pt-2 text-sm text-muted-foreground">
                  {t(locale, 'dashboard.noJobsToday')}
                </p>
              ) : (
                <ol className="divide-y divide-border/70 border-t border-border/70">
                  {board.slice(0, 5).map((job) => {
                    const object = first(job.cleaning_objects);
                    const customer = first(job.customers);
                    const isRunning = job.job_time_entries.some((entry) => !entry.finished_at);
                    const isDone = job.status === 'COMPLETED';
                    return (
                      <li key={job.id}>
                        <Link
                          href={`/dashboard/auftraege/${job.id}`}
                          className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-subtle"
                        >
                          <span className="w-[4.5rem] shrink-0 text-[13px] font-medium tabular-nums text-muted-foreground">
                            {formatTimeRange(locale, job.planned_start_at, job.planned_end_at)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium group-hover:text-primary">
                              {object?.name ?? job.title}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {customer?.name}
                            </span>
                          </span>
                          <span className="shrink-0">
                            {isRunning ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-medium text-success">
                                <span className="size-1.5 rounded-full bg-current motion-safe:animate-pulse-dot" aria-hidden="true" />
                                {t(locale, 'status.IN_PROGRESS')}
                              </span>
                            ) : isDone ? (
                              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
                                <CheckCircle2 className="size-3.5" aria-hidden="true" />
                                {t(locale, 'status.COMPLETED')}
                              </span>
                            ) : (
                              <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                                {t(locale, `status.${job.status}`)}
                              </span>
                            )}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              )}
            </SectionCard>
          </div>

          {/* --- C. Job status and money ----------------------------------- */}
          <div className="grid gap-5 lg:grid-cols-2">
            <SectionCard title={t(locale, 'dashboard.jobStatus')}>
              <StatusDonut
                total={jobStatus.total}
                totalLabel={t(locale, 'nav.jobs')}
                emptyLabel={t(locale, 'dashboard.noJobsThisMonth')}
                slices={[
                  { label: t(locale, 'status.PLANNED'), value: jobStatus.planned },
                  { label: t(locale, 'status.CONFIRMED'), value: jobStatus.confirmed },
                  { label: t(locale, 'status.IN_PROGRESS'), value: jobStatus.inProgress },
                  { label: t(locale, 'status.COMPLETED'), value: jobStatus.completed },
                ]}
              />
            </SectionCard>

            <SectionCard
              title={t(locale, 'dashboard.finance')}
              action={<CardLink href="/dashboard/abrechnung">{t(locale, 'dashboard.viewAll')}</CardLink>}
            >
              <dl className="divide-y divide-border/70">
                <FinanceRow
                  label={t(locale, 'dashboard.openReceivables')}
                  value={money(billing.openCents)}
                  href="/dashboard/abrechnung?status=ISSUED"
                />
                <FinanceRow
                  label={t(locale, 'billing.status.OVERDUE')}
                  value={money(billing.overdueCents)}
                  href="/dashboard/abrechnung?status=OVERDUE"
                  tone={billing.overdueCents > 0 ? 'danger' : undefined}
                />
                <FinanceRow
                  label={t(locale, 'dashboard.draftInvoices')}
                  value={String(billing.draftCount)}
                  href="/dashboard/abrechnung?status=DRAFT"
                />
                <FinanceRow
                  label={t(locale, 'billing.status.PAID')}
                  value={money(billing.paidCents)}
                  href="/dashboard/abrechnung?status=PAID"
                  tone="success"
                />
              </dl>
            </SectionCard>
          </div>

          {/* --- H. What happened recently --------------------------------- */}
          <SectionCard title={t(locale, 'dashboard.recentActivity')} flush>
            {activity.length === 0 ? (
              <p className="px-5 pb-6 pt-2 text-sm text-muted-foreground">
                {t(locale, 'dashboard.noActivity')}
              </p>
            ) : (
              <ol className="divide-y divide-border/70 border-t border-border/70">
                {activity.map((entry) => {
                  const Icon = activityIcons[entry.kind];
                  return (
                    <li key={`${entry.kind}-${entry.href}`}>
                      <Link
                        href={entry.href}
                        className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-subtle"
                      >
                        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground" aria-hidden="true">
                          <Icon className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium group-hover:text-primary">
                            {entry.title}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {t(locale, `activity.${entry.kind}`)}
                          </span>
                        </span>
                        <time
                          dateTime={entry.at}
                          className="shrink-0 text-xs tabular-nums text-muted-foreground"
                        >
                          {formatDate(locale, entry.at.slice(0, 10), 'short')}
                        </time>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            )}
          </SectionCard>
        </div>

        {/* ================= right rail ================= */}
        <aside className="min-w-0 space-y-5">
          {/* --- C. The one thing worth starting --------------------------- */}
          <section className="relative isolate overflow-hidden rounded-card text-white shadow-raised">
            <BrandBackdrop photo={brandImage.dashboardHero} />
            <div className="p-5">
              <h2 className="text-[1.3rem] font-semibold leading-snug tracking-tight">
                {t(locale, 'dashboard.heroTitle')}
              </h2>
              <p className="mt-2 text-sm leading-6 text-white/75">{t(locale, 'dashboard.heroBody')}</p>
              <ButtonLink href="/dashboard/vertrieb/anfragen/neu" className="mt-5">
                Neue Anfrage
                <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
              </ButtonLink>
            </div>
          </section>

          {/* --- D. What needs a decision ---------------------------------- */}
          <OfficeActionPanel items={actions} />

          {/* --- G. Where the common jobs start ---------------------------- */}
          <SectionCard title={t(locale, 'dashboard.quickActions')}>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
              <QuickAction href="/dashboard/kunden/neu" label={t(locale, 'dashboard.newCustomer')} icon={<UserPlus />} />
              <QuickAction href="/dashboard/vertrieb/anfragen/neu" label={t(locale, 'dashboard.newLead')} icon={<Inbox />} />
              <QuickAction href="/dashboard/planung" label="Planung öffnen" icon={<CalendarClock />} />
              <QuickAction href="/dashboard/auftraege/neu" label={t(locale, 'dashboard.planJob')} icon={<CalendarPlus />} />
            </div>
          </SectionCard>

          {/* --- I. Quality, from what is actually measured ---------------- */}
          <SectionCard
            title={t(locale, 'dashboard.quality')}
            action={<CardLink href="/dashboard/qualitaetskontrolle">{t(locale, 'dashboard.viewAll')}</CardLink>}
          >
            {quality.inspections === 0 && quality.acceptedRecords === 0 ? (
              <EmptyState
                className="border-0 bg-transparent px-0 py-4 text-start"
                title={t(locale, 'dashboard.qualityNoData')}
                body={t(locale, 'dashboard.qualityNoDataBody')}
              />
            ) : (
              <dl className="space-y-3.5">
                {quality.averageScore !== null && (
                  <div>
                    <dt className="text-[13px] text-muted-foreground">{t(locale, 'dashboard.qualityScore')}</dt>
                    <dd className="mt-1 flex items-baseline gap-2">
                      <span className="text-2xl font-semibold tabular-nums">{quality.averageScore}</span>
                      <span className="text-sm text-muted-foreground">/ 100</span>
                    </dd>
                  </div>
                )}
                {quality.inspections > 0 && (
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-[13px] text-muted-foreground">{t(locale, 'dashboard.qualityChecks')}</dt>
                    <dd className="text-sm font-medium tabular-nums">
                      {t(locale, 'dashboard.qualityPassRate', {
                        passed: quality.passed,
                        total: quality.inspections,
                      })}
                    </dd>
                  </div>
                )}
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-[13px] text-muted-foreground">{t(locale, 'dashboard.acceptedServices')}</dt>
                  <dd className="text-sm font-medium tabular-nums">{quality.acceptedRecords}</dd>
                </div>
                {(quality.openComplaints > 0 || quality.disputedRecords > 0) && (
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-[13px] text-muted-foreground">{t(locale, 'dashboard.openComplaints')}</dt>
                    <dd className="text-sm font-medium tabular-nums text-warning">
                      {quality.openComplaints + quality.disputedRecords}
                    </dd>
                  </div>
                )}
                <p className="border-t border-border/70 pt-3 text-xs leading-5 text-muted-foreground">
                  {t(locale, 'dashboard.qualityBasis')}
                </p>
              </dl>
            )}
          </SectionCard>

          <ButtonLink href="/dashboard/planung" variant="outline" className="w-full">
            <CalendarClock className="size-4" aria-hidden="true" />
            {t(locale, 'dashboard.openPlanning')}
          </ButtonLink>
        </aside>
      </div>
    </div>
  );
}

/** One line of the finance panel, linking to the list it is counted from. */
function FinanceRow({
  label,
  value,
  href,
  tone,
}: {
  label: string;
  value: string;
  href: string;
  tone?: 'danger' | 'success';
}) {
  return (
    <div>
      <Link
        href={href}
        className="group flex items-baseline justify-between gap-4 py-2.5 transition-colors hover:text-primary"
      >
        <dt className="text-sm text-muted-foreground group-hover:text-primary">{label}</dt>
        <dd
          className={cn(
            'text-sm font-semibold tabular-nums',
            tone === 'danger' && 'text-danger',
            tone === 'success' && 'text-success',
          )}
        >
          {value}
        </dd>
      </Link>
    </div>
  );
}

/** Month names in the reader's language, from the platform rather than a list. */
function monthLabels(locale: Locale) {
  const tag = locale === 'de' ? 'de-DE' : locale;
  const shortFormat = new Intl.DateTimeFormat(tag, { month: 'short', timeZone: 'UTC' });
  const longFormat = new Intl.DateTimeFormat(tag, { month: 'long', timeZone: 'UTC' });
  const months = Array.from({ length: 12 }, (_, index) => new Date(Date.UTC(2024, index, 1)));
  return {
    short: months.map((date) => shortFormat.format(date).replace('.', '')),
    long: months.map((date) => longFormat.format(date)),
  };
}
