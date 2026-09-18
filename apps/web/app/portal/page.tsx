import Link from 'next/link';
import { Building2, CalendarClock, FileText } from 'lucide-react';
import { Card } from '@/components/ui';
import { PortalEmptyState, PortalPageHeader } from '@/components/portal/portal-shell';
import { getPortalOverview, listPortalObjects, listPortalServiceRecords, listPortalUpcomingJobs, portalLocale } from '@/lib/data/portal';
import { formatDate, formatTimeRange } from '@/lib/format';
import { t } from '@/lib/i18n';

export default async function PortalOverviewPage() {
  const [locale, overview, objects, upcoming, records] = await Promise.all([
    portalLocale(),
    getPortalOverview(),
    listPortalObjects(),
    listPortalUpcomingJobs(28),
    listPortalServiceRecords(5),
  ]);

  const stats = [
    { icon: Building2, label: t(locale, 'portal.tab.objects'), value: objects.length, href: '/portal/objekte' },
    { icon: CalendarClock, label: t(locale, 'portal.overview.upcoming'), value: upcoming.length, href: '/portal' },
    { icon: FileText, label: t(locale, 'portal.tab.services'), value: records.length, href: '/portal/leistungen' },
  ];

  return (
    <>
      <PortalPageHeader
        title={t(locale, 'portal.overview.title', { name: overview?.customerName ?? '' })}
        subtitle={t(locale, 'portal.overview.subtitle')}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        {stats.map(({ icon: Icon, label, value, href }) => (
          <Link key={label} href={href} className="rounded-lg border bg-white p-4 transition-colors hover:border-primary">
            <div className="flex items-center gap-2 text-slate-500">
              <Icon className="size-4" aria-hidden="true" />
              <span className="text-sm">{label}</span>
            </div>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
          </Link>
        ))}
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          {t(locale, 'portal.overview.upcoming')}
        </h2>
        {upcoming.length === 0 ? (
          <PortalEmptyState icon={<CalendarClock className="size-5" />} title={t(locale, 'portal.overview.noUpcoming')} />
        ) : (
          <ul className="space-y-3">
            {upcoming.slice(0, 6).map((job) => (
              <li key={job.id} className="rounded-lg border bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{job.object_name}</p>
                    <p className="mt-0.5 text-sm text-slate-600">
                      {formatDate(locale, job.scheduled_date, 'long')} · {formatTimeRange(locale, job.planned_start_at, job.planned_end_at)}
                    </p>
                  </div>
                  <span className="inline-flex shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                    {t(locale, `status.${job.status}`)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
