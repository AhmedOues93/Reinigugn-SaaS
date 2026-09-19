import Link from 'next/link';
import { ArrowRight, CalendarCheck2, CheckCircle2, ChevronRight, MapPin, Navigation } from 'lucide-react';
import { cn } from '@reinigung/ui';
import { EmptyState } from '@/components/ui';
import { employeeLocale, listMyTodayAndUpcoming, requireEmployee } from '@/lib/data/employee';
import { formatDate, formatTime, formatTimeRange } from '@/lib/format';
import { t } from '@/lib/i18n';

type Job = Awaited<ReturnType<typeof listMyTodayAndUpcoming>>['today'][number];

function first<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}
function stateOf(job: Job) {
  const entry = job.job_time_entries?.[0];
  if (job.status === 'COMPLETED' || entry?.finished_at) return 'done' as const;
  if (entry && !entry.finished_at) return (entry.job_time_breaks ?? []).some((b) => !b.ended_at) ? ('paused' as const) : ('running' as const);
  return 'open' as const;
}

export default async function EmployeeTodayPage() {
  const [{ profile }, locale, { today, upcoming, todayKey }] = await Promise.all([
    requireEmployee(),
    employeeLocale(),
    listMyTodayAndUpcoming(),
  ]);
  const done = today.filter((job) => stateOf(job) === 'done').length;
  const current = today.find((job) => ['running', 'paused'].includes(stateOf(job))) ?? today.find((job) => stateOf(job) === 'open') ?? null;
  const currentState = current ? stateOf(current) : null;
  const object = first(current?.cleaning_objects);
  const address = [object?.street, [object?.postal_code, object?.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const items = first(current?.job_checklists)?.job_checklist_items ?? [];

  const upcomingByDay = upcoming.slice(0, 8).reduce<Record<string, Job[]>>((groups, job) => {
    (groups[job.scheduled_date] ??= []).push(job);
    return groups;
  }, {});

  return (
    <div className="space-y-7">
      <header>
        <p className="text-sm font-medium text-muted-foreground">{formatDate(locale, todayKey, 'long')}</p>
        <h1 className="mt-0.5 text-[1.6rem] font-semibold leading-tight">
          {profile?.first_name ? t(locale, 'emp.today.greeting', { name: profile.first_name }) : t(locale, 'emp.tab.today')}
        </h1>
      </header>

      {today.length === 0 ? (
        <EmptyState icon={<CalendarCheck2 />} title={t(locale, 'emp.today.noJobs')} body={t(locale, 'emp.today.noJobsBody')} className="rounded-3xl" />
      ) : current ? (
        /* The one thing to do now. */
        <section aria-labelledby="hero-title" className="surface-ink relative overflow-hidden rounded-3xl p-5 shadow-raised">
          <p className="flex items-center gap-2 text-sm font-medium text-ink-muted">
            {currentState !== 'open' && (
              <span className={cn('size-2 rounded-full', currentState === 'paused' ? 'bg-[hsl(38_95%_60%)]' : 'bg-highlight motion-safe:animate-pulse-dot')} aria-hidden="true" />
            )}
            {currentState === 'open' ? t(locale, 'emp.today.nextJob') : currentState === 'paused' ? t(locale, 'emp.job.paused') : t(locale, 'emp.today.current')}
          </p>
          <p className="mt-3 text-[2.4rem] font-semibold leading-none tracking-tight tabular-nums text-white">
            {current.planned_start_at ? formatTime(locale, current.planned_start_at) : '—'}
            {current.planned_end_at && <span className="ms-2 text-lg font-medium text-ink-muted">– {formatTime(locale, current.planned_end_at)}</span>}
          </p>
          <h2 id="hero-title" className="mt-3 text-xl font-semibold text-white">
            {object?.name || current.title}
          </h2>
          <p className="text-sm text-ink-muted">{first(current.customers)?.name}</p>
          {address && (
            <p className="mt-3 flex items-start gap-2 text-sm text-white/85">
              <MapPin className="mt-0.5 size-4 shrink-0 text-highlight" aria-hidden="true" />
              <span className="break-anywhere">{address}</span>
            </p>
          )}
          {items.length > 0 && (
            <p className="mt-1.5 text-sm text-ink-muted">
              {t(locale, 'emp.job.checklistProgress', { done: items.filter((item) => item.completed_at).length, total: items.length })}
            </p>
          )}
          <div className="mt-5 flex gap-2.5">
            <Link
              href={`/mitarbeiter/einsaetze/${current.id}`}
              className="flex min-h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-highlight px-4 text-base font-semibold text-ink transition-colors hover:bg-[hsl(185_64%_68%)]"
            >
              {currentState === 'open' ? t(locale, 'emp.today.openJob') : t(locale, 'emp.job.timeTitle')}
              <ArrowRight className="size-5 rtl:rotate-180" aria-hidden="true" />
            </Link>
            {address && (
              <a
                href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(address)}`}
                target="_blank"
                rel="noreferrer"
                aria-label={t(locale, 'emp.job.navigate')}
                className="grid size-14 shrink-0 place-items-center rounded-2xl border border-white/20 bg-white/[0.06] text-white transition-colors hover:bg-white/[0.12]"
              >
                <Navigation className="size-5" aria-hidden="true" />
              </a>
            )}
          </div>
        </section>
      ) : (
        <div className="flex items-center gap-4 rounded-3xl border border-success/20 bg-success-soft p-5">
          <CheckCircle2 className="size-8 shrink-0 text-success" aria-hidden="true" />
          <div>
            <p className="font-semibold text-foreground">{t(locale, 'emp.today.allDone')}</p>
            <p className="text-sm text-muted-foreground">{t(locale, 'emp.today.allDoneBody')}</p>
          </div>
        </div>
      )}

      {today.length > 0 && (
        <section aria-labelledby="day-plan">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="day-plan" className="text-lg font-semibold">
              {t(locale, 'emp.today.dayPlan')}
            </h2>
            <span className="text-sm tabular-nums text-muted-foreground">{t(locale, 'emp.today.progress', { done, total: today.length })}</span>
          </div>
          <ol className="relative space-y-1 before:absolute before:bottom-6 before:start-[calc(5.25rem-0.5px)] before:top-6 before:w-px before:bg-border">
            {today.map((job) => {
              const state = stateOf(job);
              return (
                <li key={job.id}>
                  <Link
                    href={`/mitarbeiter/einsaetze/${job.id}`}
                    aria-current={job.id === current?.id ? 'step' : undefined}
                    className={cn(
                      'group relative flex min-h-16 items-center gap-4 rounded-2xl px-3 py-3 transition-colors hover:bg-card',
                      job.id === current?.id && 'bg-card shadow-card',
                    )}
                  >
                    <span className={cn('w-12 shrink-0 text-sm font-semibold tabular-nums', state === 'done' && 'text-muted-foreground')}>
                      {job.planned_start_at ? formatTime(locale, job.planned_start_at) : '—'}
                    </span>
                    <span
                      aria-hidden="true"
                      className={cn(
                        'relative z-10 grid size-4 shrink-0 place-items-center rounded-full border-2 bg-background',
                        state === 'done' && 'border-success bg-success',
                        state === 'running' && 'border-primary bg-primary ring-4 ring-primary/15',
                        state === 'paused' && 'border-warning bg-warning',
                        state === 'open' && 'border-input',
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className={cn('block truncate font-medium', state === 'done' && 'text-muted-foreground')}>
                        {first(job.cleaning_objects)?.name || job.title}
                      </span>
                      <span className="block truncate text-sm text-muted-foreground">
                        {state === 'done' ? t(locale, 'emp.job.done') : state === 'running' ? t(locale, 'emp.job.running') : state === 'paused' ? t(locale, 'emp.job.paused') : first(job.customers)?.name}
                      </span>
                    </span>
                    <ChevronRight className="size-5 shrink-0 text-muted-foreground/60 rtl:rotate-180" aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {Object.keys(upcomingByDay).length > 0 && (
        <section aria-labelledby="next-up">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="next-up" className="text-lg font-semibold">
              {t(locale, 'emp.today.nextUp')}
            </h2>
            <Link href="/mitarbeiter/einsaetze" className="inline-flex min-h-touch items-center text-sm font-medium text-primary">
              {t(locale, 'emp.tab.schedule')}
            </Link>
          </div>
          <div className="space-y-4">
            {Object.entries(upcomingByDay).map(([day, jobs]) => (
              <div key={day}>
                <p className="mb-1.5 px-1 text-sm font-medium text-muted-foreground">{formatDate(locale, day, 'long')}</p>
                <ul className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-card">
                  {jobs.map((job) => (
                    <li key={job.id} className="border-b border-border/70 last:border-0">
                      <Link href={`/mitarbeiter/einsaetze/${job.id}`} className="flex min-h-touch items-center gap-4 px-4 py-3 transition-colors hover:bg-subtle">
                        <span className="w-24 shrink-0 text-sm tabular-nums text-muted-foreground">
                          {formatTimeRange(locale, job.planned_start_at, job.planned_end_at)}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-medium">{first(job.cleaning_objects)?.name || job.title}</span>
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground/60 rtl:rotate-180" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
