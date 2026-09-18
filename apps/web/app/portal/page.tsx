import Link from 'next/link';
import { ArrowRight, Building2, CalendarClock, FileText, Receipt } from 'lucide-react';
import { Badge, Card, EmptyState } from '@/components/ui';
import { PortalPageHeader } from '@/components/portal/portal-shell';
import {
  getPortalOverview,
  listPortalObjects,
  listPortalServiceRecords,
  listPortalUpcomingJobs,
  portalLocale,
} from '@/lib/data/portal';
import { listPortalInvoices } from '@/lib/data/portal-invoices';
import { formatDate, formatMoney, formatTimeRange } from '@/lib/format';
import { t } from '@/lib/i18n';

export default async function PortalOverviewPage() {
  const [locale, overview, objects, upcoming, records, invoices] = await Promise.all([
    portalLocale(),
    getPortalOverview(),
    listPortalObjects(),
    listPortalUpcomingJobs(28),
    listPortalServiceRecords(5),
    listPortalInvoices(),
  ]);

  const openInvoices = invoices.filter((invoice) => invoice.status === 'ISSUED');
  const openCents = openInvoices.reduce((total, invoice) => total + invoice.gross_total_cents, 0);
  const overdue = openInvoices.some((invoice) => invoice.is_overdue);

  const tiles = [
    { icon: Building2, label: t(locale, 'portal.tab.objects'), value: String(objects.length), href: '/portal/objekte' },
    { icon: FileText, label: t(locale, 'portal.tab.services'), value: String(records.length), href: '/portal/leistungen' },
    {
      icon: Receipt,
      label: t(locale, 'billing.status.ISSUED'),
      value: formatMoney(locale, openCents),
      href: '/portal/rechnungen',
      tone: overdue ? ('danger' as const) : undefined,
    },
  ];

  return (
    <>
      <PortalPageHeader
        title={t(locale, 'portal.overview.title', { name: overview?.customerName ?? '' })}
        subtitle={t(locale, 'portal.overview.subtitle')}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        {tiles.map(({ icon: Icon, label, value, href, tone }) => (
          <Link
            key={label}
            href={href}
            className="group rounded-lg border border-border bg-card p-4 shadow-card transition-colors hover:border-primary"
          >
            <div className="flex items-center gap-2 text-muted-foreground">
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              <span className="truncate text-sm">{label}</span>
            </div>
            <p className={`mt-2 text-2xl font-semibold tabular-nums ${tone === 'danger' ? 'text-danger' : ''}`}>{value}</p>
          </Link>
        ))}
      </div>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t(locale, 'portal.overview.upcoming')}
          </h2>
        </div>
        {upcoming.length === 0 ? (
          <EmptyState icon={<CalendarClock className="size-5" />} title={t(locale, 'portal.overview.noUpcoming')} />
        ) : (
          <Card className="divide-y divide-border">
            {upcoming.slice(0, 6).map((job) => (
              <div key={job.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate font-medium">{job.object_name}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {formatDate(locale, job.scheduled_date, 'long')} ·{' '}
                    {formatTimeRange(locale, job.planned_start_at, job.planned_end_at)}
                  </p>
                </div>
                <Badge tone={job.status === 'CONFIRMED' ? 'info' : 'neutral'}>{t(locale, `status.${job.status}`)}</Badge>
              </div>
            ))}
          </Card>
        )}
      </section>

      {records.length > 0 && (
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t(locale, 'portal.services.title')}
            </h2>
            <Link href="/portal/leistungen" className="inline-flex min-h-touch items-center gap-1 text-sm font-medium text-primary">
              {t(locale, 'common.open')}
              <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
            </Link>
          </div>
          <Card className="divide-y divide-border">
            {records.slice(0, 3).map((record) => (
              <Link
                key={record.job_id}
                href={`/portal/leistungen/${record.job_id}`}
                className="flex items-center justify-between gap-3 p-4 hover:bg-muted"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{record.object_name}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{formatDate(locale, record.scheduled_date, 'long')}</p>
                </div>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden="true" />
              </Link>
            ))}
          </Card>
        </section>
      )}
    </>
  );
}
