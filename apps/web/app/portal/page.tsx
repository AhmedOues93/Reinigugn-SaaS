import Link from 'next/link';
import { ArrowRight, CalendarClock, CheckCircle2, ChevronRight, MessageSquareWarning } from 'lucide-react';
import { Badge, ButtonLink } from '@/components/ui';
import { PortalPageHeader } from '@/components/portal/portal-shell';
import { getPortalOverview, listPortalServiceRecords, listPortalUpcomingJobs, portalLocale } from '@/lib/data/portal';
import { listPortalInvoices } from '@/lib/data/portal-invoices';
import { formatDate, formatMoney, formatTimeRange } from '@/lib/format';
import { t } from '@/lib/i18n';

/**
 * Customer-facing overview. It answers the three questions a customer has, in
 * order: when do you come next, what did you do, what do I owe. Nothing here is
 * internal: the portal RPCs expose no staff names, costs, margins or notes.
 */
export default async function PortalOverviewPage() {
  const [locale, overview, upcoming, records, invoices] = await Promise.all([
    portalLocale(),
    getPortalOverview(),
    listPortalUpcomingJobs(28),
    listPortalServiceRecords(5),
    listPortalInvoices(),
  ]);

  const open = invoices.filter((invoice) => invoice.status === 'ISSUED');
  const openCents = open.reduce((total, invoice) => total + invoice.gross_total_cents, 0);
  const overdue = open.filter((invoice) => invoice.is_overdue);
  const nextDue = [...open].sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
  const next = upcoming[0];

  return (
    <div className="space-y-9">
      <PortalPageHeader title={t(locale, 'portal.overview.title', { name: overview?.customerName ?? '' })} subtitle={t(locale, 'portal.overview.subtitle')} />

      <div className="grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        {/* When do you come next? */}
        <section aria-labelledby="next-cleaning" className="rounded-3xl border border-border/80 bg-card p-6 shadow-card">
          <p id="next-cleaning" className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <CalendarClock className="size-4 text-primary" aria-hidden="true" />
            {t(locale, 'portal.overview.nextCleaning')}
          </p>
          {next ? (
            <>
              <p className="mt-4 text-[1.9rem] font-semibold leading-tight">{formatDate(locale, next.scheduled_date, 'long')}</p>
              <p className="mt-1 text-[15px] tabular-nums text-muted-foreground">{formatTimeRange(locale, next.planned_start_at, next.planned_end_at)}</p>
              <p className="mt-4 text-[15px] font-medium">{next.object_name}</p>
              <p className="text-sm text-muted-foreground">{next.title}</p>
            </>
          ) : (
            <p className="mt-4 text-lg font-medium text-muted-foreground">{t(locale, 'portal.overview.noNextCleaning')}</p>
          )}
        </section>

        {/* What do I owe? */}
        <section aria-labelledby="amount-due" className="surface-ink flex flex-col rounded-3xl p-6">
          <p id="amount-due" className="text-sm font-medium text-ink-muted">
            {t(locale, 'portal.overview.amountDue')}
          </p>
          {openCents > 0 ? (
            <>
              <p className="mt-4 text-[2.2rem] font-semibold leading-none tabular-nums text-white">{formatMoney(locale, openCents)}</p>
              <p className={`mt-2 text-sm ${overdue.length ? 'font-medium text-[hsl(4_90%_78%)]' : 'text-ink-muted'}`}>
                {overdue.length
                  ? t(locale, 'portal.overview.overdueSince', { date: formatDate(locale, overdue[0]!.due_date) })
                  : nextDue && t(locale, 'portal.overview.dueBy', { date: formatDate(locale, nextDue.due_date) })}
              </p>
              <div className="mt-auto pt-6">
                <Link
                  href={open.length === 1 ? `/portal/rechnungen/${open[0]!.id}` : '/portal/rechnungen'}
                  className="inline-flex min-h-touch items-center gap-2 rounded-xl bg-highlight px-4 text-sm font-semibold text-ink transition-colors hover:bg-[hsl(185_64%_68%)]"
                >
                  {t(locale, 'portal.invoice.view')}
                  <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
                </Link>
              </div>
            </>
          ) : (
            <p className="mt-4 flex items-center gap-2.5 text-lg font-medium text-white">
              <CheckCircle2 className="size-5 text-highlight" aria-hidden="true" />
              {t(locale, 'portal.overview.allPaid')}
            </p>
          )}
        </section>
      </div>

      <div className="grid gap-10 lg:grid-cols-2">
        <section aria-labelledby="records">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="records" className="text-lg font-semibold">
              {t(locale, 'portal.overview.recentRecords')}
            </h2>
            <Link href="/portal/leistungen" className="inline-flex min-h-touch items-center text-sm font-medium text-primary hover:underline">
              {t(locale, 'portal.tab.services')}
            </Link>
          </div>
          {records.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-foreground/15 px-4 py-6 text-sm text-muted-foreground">{t(locale, 'portal.services.empty')}</p>
          ) : (
            <ul className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-card">
              {records.slice(0, 5).map((record) => (
                <li key={record.job_id} className="border-b border-border/70 last:border-0">
                  <Link href={`/portal/leistungen/${record.job_id}`} className="flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-subtle">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-success-soft text-success">
                      <CheckCircle2 className="size-[18px]" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{record.object_name}</span>
                      <span className="block text-sm text-muted-foreground">
                        {formatDate(locale, record.scheduled_date, 'long')}
                        {record.total_items > 0 && ` · ${record.completed_items}/${record.total_items}`}
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground/60 rtl:rotate-180" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="upcoming">
          <h2 id="upcoming" className="mb-3 text-lg font-semibold">
            {t(locale, 'portal.overview.upcoming')}
          </h2>
          {upcoming.length <= 1 ? (
            <p className="rounded-2xl border border-dashed border-foreground/15 px-4 py-6 text-sm text-muted-foreground">
              {t(locale, 'portal.overview.noUpcoming')}
            </p>
          ) : (
            <ul className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-card">
              {upcoming.slice(1, 6).map((job) => (
                <li key={job.id} className="flex items-center gap-4 border-b border-border/70 px-4 py-3.5 last:border-0">
                  <span className="w-20 shrink-0 text-sm font-medium tabular-nums">{formatDate(locale, job.scheduled_date)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">{job.object_name}</span>
                    <span className="block text-sm tabular-nums text-muted-foreground">{formatTimeRange(locale, job.planned_start_at, job.planned_end_at)}</span>
                  </span>
                  {job.status === 'CONFIRMED' && <Badge tone="info">{t(locale, 'status.CONFIRMED')}</Badge>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="flex flex-wrap items-center gap-4 rounded-3xl border border-border/80 bg-card p-5 shadow-card sm:p-6">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-warning-soft text-warning">
          <MessageSquareWarning className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{t(locale, 'portal.overview.reportIssue')}</h2>
          <p className="text-sm text-muted-foreground">{t(locale, 'portal.overview.reportIssueBody')}</p>
        </div>
        <ButtonLink href="/portal/reklamationen/neu" variant="outline">
          {t(locale, 'portal.complaints.new')}
        </ButtonLink>
      </section>
    </div>
  );
}
