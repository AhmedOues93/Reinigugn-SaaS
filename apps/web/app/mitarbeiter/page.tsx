import Link from 'next/link';
import { CalendarCheck2, CheckCircle2, ChevronRight } from 'lucide-react';
import { EmployeeJobCard } from '@/components/employee/job-card';
import { EmployeePageHeader } from '@/components/employee/employee-shell';
import { EmptyState } from '@/components/ui';
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
  const done = today.filter((job) => job.status === 'COMPLETED').length;
  const allDone = today.length > 0 && done === today.length;

  return (
    <>
      <EmployeePageHeader
        title={name ? t(locale, 'emp.today.greeting', { name }) : t(locale, 'emp.tab.today')}
        subtitle={formatDate(locale, todayKey, 'long')}
      />

      {today.length > 0 && (
        <div className="mb-4 rounded-lg border border-border bg-card p-4 shadow-card">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">{t(locale, 'emp.today.progress', { done, total: today.length })}</p>
            {allDone && <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden="true" />}
          </div>
          <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-muted" role="presentation">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${Math.round((done / today.length) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {today.length === 0 ? (
        <EmptyState
          icon={<CalendarCheck2 className="size-5" />}
          title={t(locale, 'emp.today.noJobs')}
          body={t(locale, 'emp.today.noJobsBody')}
        />
      ) : allDone ? (
        <>
          <EmptyState
            className="mb-4"
            icon={<CheckCircle2 className="size-5 text-success" />}
            title={t(locale, 'emp.today.allDone')}
            body={t(locale, 'emp.today.allDoneBody')}
          />
          <div className="grid gap-3 md:grid-cols-2">
            {today.map((job) => (
              <EmployeeJobCard key={job.id} job={job} locale={locale} />
            ))}
          </div>
        </>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {today.map((job) => (
            <EmployeeJobCard key={job.id} job={job} locale={locale} />
          ))}
        </div>
      )}

      {upcoming.length > 0 && (
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t(locale, 'emp.today.nextUp')}
            </h2>
            <Link
              href="/mitarbeiter/einsaetze"
              className="inline-flex min-h-touch items-center gap-1 text-sm font-medium text-primary"
            >
              {t(locale, 'emp.tab.schedule')}
              <ChevronRight className="size-4 rtl:rotate-180" aria-hidden="true" />
            </Link>
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {upcoming.slice(0, 3).map((job) => (
              <EmployeeJobCard key={job.id} job={job} locale={locale} showDate />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
