import Link from 'next/link';
import { CalendarCheck2, ChevronRight } from 'lucide-react';
import { EmployeeJobCard } from '@/components/employee/job-card';
import { EmployeePageHeader, EmptyState } from '@/components/employee/employee-shell';
import { employeeLocale, listMyTodayAndUpcoming, requireEmployee } from '@/lib/data/employee';
import { formatDate } from '@/lib/format';
import { t } from '@/lib/i18n';

export default async function EmployeeTodayPage() {
  const [{ profile }, locale, { today, upcoming, todayKey }] = await Promise.all([
    requireEmployee(),
    employeeLocale(),
    listMyTodayAndUpcoming(),
  ]);
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ');
  const openToday = today.filter((job) => job.status !== 'COMPLETED').length;

  return (
    <>
      <EmployeePageHeader
        title={name ? t(locale, 'emp.today.greeting', { name }) : t(locale, 'emp.tab.today')}
        subtitle={formatDate(locale, todayKey, 'long')}
      />

      {today.length > 0 && (
        <p className="mb-3 text-sm font-medium text-slate-700">{t(locale, 'emp.today.openJobs', { count: openToday })}</p>
      )}

      {today.length === 0 ? (
        <EmptyState
          icon={<CalendarCheck2 className="size-5" />}
          title={t(locale, 'emp.today.noJobs')}
          body={t(locale, 'emp.today.noJobsBody')}
        />
      ) : (
        <div className="space-y-3">
          {today.map((job) => (
            <EmployeeJobCard key={job.id} job={job} locale={locale} />
          ))}
        </div>
      )}

      {upcoming.length > 0 && (
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{t(locale, 'emp.today.nextUp')}</h2>
            <Link
              href="/mitarbeiter/einsaetze"
              className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary"
            >
              {t(locale, 'emp.tab.schedule')}
              <ChevronRight className="size-4 rtl:rotate-180" aria-hidden="true" />
            </Link>
          </div>
          <div className="space-y-3">
            {upcoming.slice(0, 3).map((job) => (
              <EmployeeJobCard key={job.id} job={job} locale={locale} showDate />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
