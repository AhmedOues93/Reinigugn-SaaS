import { CalendarDays } from 'lucide-react';
import { EmployeeJobCard } from '@/components/employee/job-card';
import { EmployeePageHeader, EmptyState } from '@/components/employee/employee-shell';
import { employeeLocale, listMyTodayAndUpcoming } from '@/lib/data/employee';
import { formatDate } from '@/lib/format';
import { t } from '@/lib/i18n';

export default async function EmployeeSchedulePage() {
  const [locale, { today, upcoming, todayKey }] = await Promise.all([employeeLocale(), listMyTodayAndUpcoming()]);
  const jobs = [...today, ...upcoming];

  const byDate = jobs.reduce<Record<string, typeof jobs>>((groups, job) => {
    (groups[job.scheduled_date] ??= []).push(job);
    return groups;
  }, {});

  return (
    <>
      <EmployeePageHeader title={t(locale, 'emp.schedule.title')} />
      {jobs.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="size-5" />}
          title={t(locale, 'emp.schedule.empty')}
          body={t(locale, 'emp.schedule.emptyBody')}
        />
      ) : (
        <div className="space-y-6">
          {Object.entries(byDate).map(([date, entries]) => (
            <section key={date}>
              <h2 className="mb-2 text-sm font-semibold text-slate-500">
                {date === todayKey ? t(locale, 'common.today') : formatDate(locale, date, 'long')}
              </h2>
              <div className="space-y-3">
                {entries.map((job) => (
                  <EmployeeJobCard key={job.id} job={job} locale={locale} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
