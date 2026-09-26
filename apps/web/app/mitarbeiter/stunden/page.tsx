import { notFound } from 'next/navigation';
import { Clock3 } from 'lucide-react';
import { MonthPicker } from '@/components/month-picker';
import { getMyMonth, hoursAndMinutes, monthKey, overtimeMinutes } from '@/lib/data/monthly-summary';
import { employeeLocale } from '@/lib/data/employee';
import { t } from '@/lib/i18n';

/**
 * The employee's own month.
 *
 * Their hours and nothing else: no colleague's figures, no wage, no cost. An
 * employee is entitled to see the time recorded against their name — it is the
 * record the company keeps about them — and equally entitled not to have pay
 * discussed on a phone screen by an app. Anything beyond the numbers is a
 * conversation with the office, which is what the intro line says.
 */
export default async function MyHoursPage({
  searchParams,
}: {
  searchParams: Promise<{ monat?: string }>;
}) {
  const query = await searchParams;
  const month = monthKey(query.monat).slice(0, 7);
  const [locale, figures] = await Promise.all([employeeLocale(), getMyMonth(month)]);
  if (!figures) notFound();

  const balance = overtimeMinutes(figures);

  return (
    <div className="px-4 pb-8 pt-5">
      <h1 className="flex items-center gap-2.5 text-[1.4rem] font-semibold tracking-tight">
        <Clock3 className="size-5 shrink-0 text-primary" aria-hidden="true" />
        {t(locale, 'emp.hours.title')}
      </h1>
      <p className="mt-1 text-[15px] leading-6 text-muted-foreground">{t(locale, 'emp.hours.intro')}</p>

      <div className="mt-5">
        <MonthPicker month={month} basePath="/mitarbeiter/stunden" />
      </div>

      <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-card">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t(locale, 'emp.hours.worked')}
        </p>
        <p className="mt-1 text-[2.4rem] font-semibold leading-none tabular-nums tracking-tight">
          {hoursAndMinutes(figures.worked_minutes)}
        </p>

        {figures.target_minutes != null ? (
          <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-border/70 pt-4 text-sm">
            <div className="min-w-0">
              <dt className="text-muted-foreground">{t(locale, 'emp.hours.target')}</dt>
              <dd className="mt-0.5 font-medium tabular-nums">{hoursAndMinutes(figures.target_minutes)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-muted-foreground">
                {t(locale, balance != null && balance < 0 ? 'emp.hours.shortfall' : 'emp.hours.overtime')}
              </dt>
              <dd
                className={`mt-0.5 font-medium tabular-nums ${
                  balance == null || balance === 0 ? '' : balance < 0 ? 'text-warning' : 'text-success'
                }`}
              >
                {balance == null ? '—' : `${balance > 0 ? '+' : ''}${hoursAndMinutes(balance)}`}
              </dd>
            </div>
          </dl>
        ) : (
          /* Neutral: nothing is wrong, the office simply has not recorded a week. */
          <p className="mt-5 border-t border-border/70 pt-4 text-sm leading-6 text-muted-foreground">
            {t(locale, 'emp.hours.noTarget')}
          </p>
        )}
      </section>

      <dl className="mt-4 grid grid-cols-3 gap-3">
        {[
          { label: t(locale, 'emp.hours.days'), value: figures.days_worked },
          { label: t(locale, 'emp.hours.vacation'), value: figures.vacation_days },
          { label: t(locale, 'emp.hours.sick'), value: figures.sick_days },
        ].map((item) => (
          <div key={item.label} className="min-w-0 rounded-xl border border-border/80 bg-card p-3.5 text-center shadow-card">
            <dt className="truncate text-xs text-muted-foreground">{item.label}</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums">{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
