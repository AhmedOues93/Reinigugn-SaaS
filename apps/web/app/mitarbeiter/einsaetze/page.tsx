import { CalendarDays } from 'lucide-react';
import { EmployeeJobCard } from '@/components/employee/job-card';
import { EmployeePageHeader } from '@/components/employee/employee-shell';
import { EmptyState } from '@/components/ui';
import { employeeLocale, listMyTodayAndUpcoming } from '@/lib/data/employee';
import { addDays } from '@/lib/date';
import { formatDate } from '@/lib/format';
import { t } from '@/lib/i18n';

export default async function EmployeeSchedulePage() {
  const [locale, { today, upcoming, todayKey }] = await Promise.all([employeeLocale(), listMyTodayAndUpcoming()]);
  const jobs = [...today, ...upcoming];
  const weekEnd = addDays(todayKey, 7);

  // Grouped by day, and split into "this week" and "later" so a long list stays
  // scannable on a phone.
  const groups = jobs.reduce<Record<string, typeof jobs>>((acc, job) => {
    (acc[job.scheduled_date] ??= []).push(job);
    return acc;
  }, {});
  const days = Object.keys(groups).sort();
  const thisWeek = days.filter((day) => day <= weekEnd);
  const later = days.filter((day) => day > weekEnd);

  const section = (label: string, dayKeys: string[]) =>
    dayKeys.length === 0 ? null : (
      <section key={label} className="mt-6 first:mt-0">
        <h2 className="mb-3 text-lg font-semibold">{label}</h2>
        <div className="space-y-5">
          {dayKeys.map((day) => (
            <div key={day}>
              <p className="mb-2 px-1 text-sm font-medium text-muted-foreground">
                {day === todayKey ? t(locale, 'common.today') : formatDate(locale, day, 'long')}
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                {groups[day].map((job) => (
                  <EmployeeJobCard key={job.id} job={job} locale={locale} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    );

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
        <>
          {section(t(locale, 'emp.schedule.thisWeek'), thisWeek)}
          {section(t(locale, 'emp.schedule.later'), later)}
        </>
      )}
    </>
  );
}
