import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarClock,
  CalendarOff,
  CheckCircle2,
  ClipboardX,
  FileWarning,
  MessageSquareWarning,
  ShieldAlert,
  Stethoscope,
} from 'lucide-react';
import { cn } from '@reinigung/ui';
import { ButtonLink, EmptyState, StatBand } from '@/components/ui';
import { OfficeActionPanel } from '@/components/dashboard/action-items';
import { getOnboardingStatus, shouldRunOnboarding } from '@/lib/data/onboarding';
import { landingPathForRole } from '@/lib/landing';
import { getCurrentCompany } from '@/lib/auth';
import { getBillingSummary, getOfficeActionItems } from '@/lib/data/billing';
import { getDashboardMetrics, listTodayBoard } from '@/lib/data/jobs';
import { getSalesSummary } from '@/lib/data/sales';
import { formatDate, formatMoney, formatTimeRange } from '@/lib/format';
import { berlinDateKey } from '@/lib/date';
import { t } from '@/lib/i18n';
import { currentLocale } from '@/lib/i18n-server';

function first<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export default async function DashboardPage() {
  const { membership, profile } = await getCurrentCompany();
  if (membership && membership.role !== 'OWNER' && membership.role !== 'OFFICE') redirect(landingPathForRole(membership.role));

  /*
   * A brand-new company lands in the setup wizard rather than on an empty
   * dashboard. Once, and only for the OWNER: an OFFICE colleague joining an
   * established company has no business in somebody else's company setup.
   */
  if (membership?.role === 'OWNER') {
    const onboarding = await getOnboardingStatus();
    if (shouldRunOnboarding(onboarding, membership.role)) redirect('/dashboard/einrichtung');
  }
  const [metrics, board, billing, sales, actions, locale] = await Promise.all([
    getDashboardMetrics(),
    listTodayBoard(),
    getBillingSummary(),
    getSalesSummary(),
    getOfficeActionItems(),
    currentLocale(),
  ]);

  const firstName = profile?.first_name || '';
  const done = board.filter((job) => job.status === 'COMPLETED').length;
  const now = new Date();
  const running = board.filter((job) => job.job_time_entries.some((entry) => !entry.finished_at));
  // A visit whose planned start is more than 15 minutes ago with no clock-in.
  const late = board.filter(
    (job) =>
      (job.status === 'PLANNED' || job.status === 'CONFIRMED') &&
      job.planned_start_at &&
      new Date(job.planned_start_at).getTime() < now.getTime() - 15 * 60_000 &&
      job.job_time_entries.length === 0,
  );
  const hours = Math.floor(metrics.workedMinutes / 60);
  const minutes = metrics.workedMinutes % 60;

  const openLeads = sales
    .filter((row) => ['NEW', 'CONTACTED', 'SURVEY_BOOKED', 'QUOTED'].includes(row.status))
    .reduce((total, row) => total + Number(row.lead_count), 0);
  const quotedCents = sales
    .filter((row) => row.status === 'QUOTED')
    .reduce((total, row) => total + Number(row.quoted_gross_cents), 0);

  const attention = [
    { count: late.length, label: t(locale, 'dashboard.missedJobs'), href: '/dashboard/auftraege', icon: ClipboardX, tone: 'danger' as const },
    { count: metrics.affectedAbsenceJobs, label: t(locale, 'dashboard.affectedAbsenceJobs'), href: '/dashboard/urlaub-krankheit', icon: AlertTriangle, tone: 'danger' as const },
    { count: metrics.overdueComplaints, label: t(locale, 'dashboard.overdueComplaints'), href: '/dashboard/reklamationen', icon: MessageSquareWarning, tone: 'danger' as const },
    { count: billing.overdueCount, label: t(locale, 'dashboard.overdueInvoices'), href: '/dashboard/abrechnung?status=OVERDUE', icon: FileWarning, tone: 'danger' as const },
    { count: metrics.openComplaints - metrics.overdueComplaints, label: t(locale, 'dashboard.openComplaints'), href: '/dashboard/reklamationen', icon: MessageSquareWarning, tone: 'warning' as const },
    { count: metrics.openVacationRequests, label: t(locale, 'dashboard.openVacationRequests'), href: '/dashboard/urlaub-krankheit', icon: CalendarOff, tone: 'warning' as const },
    { count: metrics.recentQualityIssues, label: t(locale, 'dashboard.qualityIssues'), href: '/dashboard/qualitaetskontrolle', icon: ShieldAlert, tone: 'warning' as const },
    { count: metrics.sickToday, label: t(locale, 'dashboard.sickToday'), href: '/dashboard/urlaub-krankheit', icon: Stethoscope, tone: 'neutral' as const },
  ].filter((item) => item.count > 0);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{formatDate(locale, berlinDateKey(), 'long')}</p>
          <h1 className="mt-1 text-[1.75rem] font-semibold leading-tight sm:text-[2rem]">
            {firstName ? t(locale, 'dashboard.welcome', { name: firstName }) : t(locale, 'dashboard.subtitle')}
          </h1>
          {firstName && <p className="mt-1 text-[15px] text-muted-foreground">{t(locale, 'dashboard.subtitle')}</p>}
        </div>
        <ButtonLink href="/dashboard/planung" variant="outline">
          <CalendarClock className="size-4" aria-hidden="true" />
          {t(locale, 'dashboard.openPlanning')}
        </ButtonLink>
      </header>

      {/*
        What needs a decision, above the numbers. The stat band describes the
        day; this says what to do about it, and each row goes straight to the
        screen that can resolve it.
      */}
      <OfficeActionPanel items={actions} />

      <StatBand
        items={[
          {
            label: t(locale, 'dashboard.todayJobs'),
            value: metrics.todayJobs,
            note: metrics.todayJobs ? t(locale, 'dashboard.doneOf', { done, total: board.length }) : undefined,
            href: '/dashboard/auftraege',
          },
          {
            label: t(locale, 'dashboard.runningNow'),
            value: metrics.activeWorkers,
            note: `${metrics.employeesScheduled} ${t(locale, 'dashboard.activeEmployees').toLocaleLowerCase()}`,
            href: '/dashboard/arbeitszeiten',
          },
          {
            label: t(locale, 'dashboard.timeToday'),
            value: `${hours} h ${String(minutes).padStart(2, '0')}`,
            href: '/dashboard/arbeitszeiten',
          },
          {
            label: t(locale, 'dashboard.openReceivables'),
            value: formatMoney(locale, billing.openCents),
            note: billing.overdueCents ? t(locale, 'dashboard.overdueNote', { amount: formatMoney(locale, billing.overdueCents) }) : undefined,
            href: '/dashboard/abrechnung?status=ISSUED',
            tone: billing.overdueCents ? 'danger' : undefined,
          },
        ]}
      />

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* Today's board: the operation as it happens. */}
        <section aria-labelledby="today-board" className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id="today-board" className="text-[15px] font-semibold">
              {t(locale, 'dashboard.todayBoard')}
            </h2>
            <Link href="/dashboard/auftraege" className="inline-flex min-h-9 items-center gap-1 text-sm font-medium text-primary hover:underline">
              {t(locale, 'dashboard.viewAll')}
            </Link>
          </div>

          {board.length === 0 ? (
            <EmptyState icon={<CalendarClock />} title={t(locale, 'dashboard.noJobsToday')} />
          ) : (
            <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-card">
              {board.length > 0 && (
                <div className="h-1 bg-muted" role="img" aria-label={t(locale, 'dashboard.doneOf', { done, total: board.length })}>
                  <div className="h-full bg-success transition-all" style={{ width: `${Math.round((done / board.length) * 100)}%` }} />
                </div>
              )}
              <ol className="divide-y divide-border/70">
                {board.map((job) => {
                  const object = first(job.cleaning_objects);
                  const customer = first(job.customers);
                  const team = job.job_assignments
                    .map((assignment) => {
                      const profileRow = first(first(assignment.company_members)?.profiles);
                      return [profileRow?.first_name, profileRow?.last_name?.slice(0, 1)].filter(Boolean).join(' ');
                    })
                    .filter(Boolean);
                  const isRunning = job.job_time_entries.some((entry) => !entry.finished_at);
                  const isDone = job.status === 'COMPLETED';
                  const isLate = late.includes(job);
                  return (
                    <li key={job.id}>
                      <Link
                        href={`/dashboard/auftraege/${job.id}`}
                        className="group grid grid-cols-[4.25rem_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3.5 transition-colors hover:bg-primary-soft/40 sm:grid-cols-[5rem_minmax(0,1fr)_minmax(0,11rem)_7.5rem] sm:px-5"
                      >
                        <span className={cn('text-sm font-semibold tabular-nums', isDone && 'text-muted-foreground line-through decoration-muted-foreground/40')}>
                          {formatTimeRange(locale, job.planned_start_at, null)}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-foreground group-hover:text-primary">{object?.name ?? job.title}</span>
                          <span className="block truncate text-xs text-muted-foreground">{customer?.name}</span>
                        </span>
                        <span className={cn('hidden truncate text-sm sm:block', team.length ? 'text-muted-foreground' : 'font-medium text-danger')}>
                          {team.length ? team.join(', ') : t(locale, 'dashboard.unassigned')}
                        </span>
                        <span className="flex justify-end">
                          {isRunning ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
                              <span className="size-2 rounded-full bg-primary motion-safe:animate-pulse-dot" aria-hidden="true" />
                              {t(locale, 'status.IN_PROGRESS')}
                            </span>
                          ) : isDone ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
                              <CheckCircle2 className="size-3.5" aria-hidden="true" />
                              {t(locale, 'status.COMPLETED')}
                            </span>
                          ) : isLate ? (
                            <span className="text-xs font-semibold text-danger">{t(locale, 'dashboard.late')}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">{t(locale, `status.${job.status}`)}</span>
                          )}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
          {running.length > 0 && <p className="sr-only">{t(locale, 'dashboard.runningNow')}: {running.length}</p>}
        </section>

        <aside className="space-y-8">
          <section aria-labelledby="attention">
            <h2 id="attention" className="mb-3 text-[15px] font-semibold">
              {t(locale, 'dashboard.attention')}
            </h2>
            {attention.length === 0 ? (
              <p className="flex items-center gap-2.5 rounded-xl border border-success/20 bg-success-soft px-4 py-3.5 text-sm font-medium text-success">
                <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
                {t(locale, 'dashboard.allClear')}
              </p>
            ) : (
              <ul className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-card">
                {attention.map(({ count, label, href, icon: Icon, tone }) => (
                  <li key={label} className="border-b border-border/70 last:border-0">
                    <Link href={href} className="group flex min-h-touch items-center gap-3 px-4 py-2.5 transition-colors hover:bg-subtle">
                      <span
                        className={cn(
                          'grid size-8 shrink-0 place-items-center rounded-lg',
                          tone === 'danger' && 'bg-danger-soft text-danger',
                          tone === 'warning' && 'bg-warning-soft text-warning',
                          tone === 'neutral' && 'bg-muted text-muted-foreground',
                        )}
                      >
                        <Icon className="size-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground">{label}</span>
                      <span className="text-sm font-semibold tabular-nums">{count}</span>
                      <ArrowUpRight className="size-4 text-muted-foreground/50 transition-colors group-hover:text-primary rtl:-scale-x-100" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="finance" className="surface-ink relative overflow-hidden rounded-xl p-5">
            <div className="flex items-center justify-between">
              <h2 id="finance" className="text-[15px] font-semibold text-white">
                {t(locale, 'dashboard.finance')}
              </h2>
              <Link href="/dashboard/abrechnung" className="rounded text-sm font-medium text-highlight hover:underline focus-visible:ring-offset-ink">
                {t(locale, 'nav.billing')}
              </Link>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-4">
              <div>
                <dt className="text-xs text-ink-muted">{t(locale, 'billing.status.ISSUED')}</dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums text-white">{formatMoney(locale, billing.openCents)}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">{t(locale, 'billing.status.OVERDUE')}</dt>
                <dd className={cn('mt-1 text-lg font-semibold tabular-nums', billing.overdueCents ? 'text-[hsl(4_90%_75%)]' : 'text-white')}>
                  {formatMoney(locale, billing.overdueCents)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">{t(locale, 'dashboard.draftInvoices')}</dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums text-white">{billing.draftCount}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">{t(locale, 'billing.status.PAID')}</dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums text-white">{formatMoney(locale, billing.paidCents)}</dd>
              </div>
            </dl>
          </section>

          <section aria-labelledby="pipeline">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="pipeline" className="text-[15px] font-semibold">
                {t(locale, 'dashboard.pipeline')}
              </h2>
              <Link href="/dashboard/vertrieb/anfragen" className="text-sm font-medium text-primary hover:underline">
                {t(locale, 'dashboard.viewAll')}
              </Link>
            </div>
            <StatBand
              className="!grid-cols-2 lg:!grid-cols-2"
              items={[
                { label: t(locale, 'dashboard.openLeads'), value: openLeads, href: '/dashboard/vertrieb/anfragen' },
                { label: t(locale, 'dashboard.quotedVolume'), value: formatMoney(locale, quotedCents), href: '/dashboard/vertrieb/angebote' },
              ]}
            />
          </section>
        </aside>
      </div>
    </div>
  );
}
