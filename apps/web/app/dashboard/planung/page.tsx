import Link from 'next/link';
import { CalendarRange, ChevronLeft, ChevronRight, Plus, Repeat } from 'lucide-react';
import { cn } from '@reinigung/ui';
import {
  listAssignableEmployeeOptions,
  listJobs,
  listSchedulesRunningOut,
  type JobStatusFilter,
} from '@/lib/data/jobs';
import { listCustomerOptions } from '@/lib/data/customers';
import { listCleaningObjectOptions } from '@/lib/data/cleaning-objects';
import { listAffectedAssignments } from '@/lib/data/absences';
import { Button, ButtonLink, Notice, PageHeader, Select } from '@/components/ui';
import { FilterBar } from '@/components/data-table';
import { ExtendHorizonButton } from '@/components/extend-horizon';
import { AutomaticPlanningAssistant } from '@/components/automatic-planning-assistant';
import { addDays, berlinDateKey } from '@/lib/date';
import { formatDate, formatTimeRange } from '@/lib/format';
import { createAutomaticWeekPlan, extendScheduleHorizon } from './actions';

type Query = {
  week?: string;
  customer?: string;
  object?: string;
  employee?: string;
  status?: string;
};

/** Monday of the week a date key falls in, as a date key. Never leaves string maths. */
function mondayOf(dateKey: string) {
  const day = new Date(`${dateKey}T12:00:00Z`).getUTCDay() || 7;
  return addDays(dateKey, 1 - day);
}

function isoWeek(dateKey: string) {
  const target = new Date(`${dateKey}T12:00:00Z`);
  target.setUTCDate(target.getUTCDate() + 4 - (target.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

function statusFilter(value?: string): JobStatusFilter {
  return value === 'PLANNED' || value === 'CONFIRMED' || value === 'CANCELLED' ? value : 'all';
}

function weekHref(query: Query, week: string) {
  const params = new URLSearchParams({ week });
  if (query.customer) params.set('customer', query.customer);
  if (query.object) params.set('object', query.object);
  if (query.employee) params.set('employee', query.employee);
  if (query.status && query.status !== 'all') params.set('status', query.status);
  return `/dashboard/planung?${params.toString()}`;
}

const weekdayLong = new Intl.DateTimeFormat('de-DE', { weekday: 'long', timeZone: 'UTC' });
const weekdayShort = new Intl.DateTimeFormat('de-DE', { weekday: 'short', timeZone: 'UTC' });
const dayMonth = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'UTC',
});
const dayMonthLong = new Intl.DateTimeFormat('de-DE', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

function one<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export default async function PlanningPage({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams;
  const currentStatus = statusFilter(query.status);
  const today = berlinDateKey();
  const start = mondayOf(query.week && /^\d{4}-\d{2}-\d{2}$/.test(query.week) ? query.week : today);
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  const end = days[6]!;

  const [jobs, customers, objects, employees, affectedAssignments, runningOut] = await Promise.all([
    listJobs({
      from: start,
      to: end,
      customerId: query.customer,
      objectId: query.object,
      memberId: query.employee,
      status: currentStatus,
    }),
    listCustomerOptions(),
    listCleaningObjectOptions(),
    listAssignableEmployeeOptions(),
    listAffectedAssignments(start, end),
    listSchedulesRunningOut(),
  ]);

  const affectedJobIds = new Set(affectedAssignments.map((assignment) => assignment.jobId));
  const byDay = new Map(days.map((day) => [day, jobs.filter((job) => job.scheduled_date === day)]));
  const thisWeek = mondayOf(today) === start;

  /** One visit on the board. The status spine is the only colour it carries. */
  const visit = (job: (typeof jobs)[number]) => {
    const object = one(job.cleaning_objects);
    const customer = one(job.customers);
    const affected = affectedJobIds.has(job.id);
    const cancelled = job.status === 'CANCELLED';
    const team = job.job_assignments
      .map((assignment) => {
        const profile = one(one(assignment.company_members)?.profiles);
        return [profile?.first_name, profile?.last_name?.slice(0, 1)].filter(Boolean).join(' ');
      })
      .filter(Boolean);

    return (
      <Link
        key={job.id}
        href={`/dashboard/auftraege/${job.id}`}
        className={cn(
          'block border-s-[3px] bg-subtle px-2.5 py-2 transition-colors hover:bg-primary-soft',
          'rounded-e-md rounded-s-sm',
          cancelled
            ? 'border-s-muted-foreground/40 opacity-60'
            : affected
              ? 'border-s-warning bg-warning-soft'
              : job.status === 'CONFIRMED'
                ? 'border-s-info'
                : 'border-s-primary',
        )}
      >
        <span className="block text-xs font-semibold tabular-nums text-foreground">
          {formatTimeRange('de', job.planned_start_at, job.planned_end_at)}
        </span>
        <span
          className={cn(
            'mt-0.5 block truncate text-[13px] font-medium text-foreground',
            cancelled && 'line-through',
          )}
        >
          {object?.name || job.title}
        </span>
        {customer?.name && (
          <span className="block truncate text-xs text-muted-foreground">{customer.name}</span>
        )}
        <span
          className={cn(
            'mt-1 block truncate text-xs',
            team.length ? 'text-muted-foreground' : 'font-medium text-danger',
          )}
        >
          {team.length ? team.join(', ') : 'Nicht eingeteilt'}
        </span>
        {affected && (
          <span className="mt-1 block text-xs font-medium text-warning">Abwesenheit beachten</span>
        )}
      </Link>
    );
  };

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Planung"
        description="Die Woche als Einsatzplan – jede Spalte ein Tag, jede Kachel ein Besuch."
        meta={
          <>
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
              <CalendarRange className="size-4 text-muted-foreground" aria-hidden="true" />
              KW {isoWeek(start)}
            </span>
            <span className="text-sm tabular-nums text-muted-foreground">
              {dayMonthLong.format(new Date(`${start}T12:00:00Z`))} –{' '}
              {dayMonthLong.format(new Date(`${end}T12:00:00Z`))}
            </span>
            <span className="text-sm text-muted-foreground">
              {jobs.length} {jobs.length === 1 ? 'Einsatz' : 'Einsätze'}
            </span>
          </>
        }
        actions={
          <>
            <ButtonLink href="/dashboard/planung/plaene" variant="outline">
              <Repeat className="size-4" aria-hidden="true" />
              Wiederkehrende Pläne
            </ButtonLink>
            <ButtonLink href="/dashboard/auftraege/neu">
              <Plus className="size-4" aria-hidden="true" />
              Auftrag
            </ButtonLink>
          </>
        }
      />

      <AutomaticPlanningAssistant weekStart={start} action={createAutomaticWeekPlan} />

      {runningOut.length > 0 && (
        <Notice
          tone="warning"
          className="mb-5"
          title={
            runningOut.length === 1
              ? 'Einem wiederkehrenden Plan gehen die Einsätze aus'
              : `${runningOut.length} wiederkehrenden Plänen gehen die Einsätze aus`
          }
        >
          <p>
            {runningOut
              .slice(0, 3)
              .map((schedule) =>
                schedule.coveredUntil
                  ? `${schedule.name} (bis ${formatDate('de', schedule.coveredUntil)})`
                  : `${schedule.name} (keine Einsätze)`,
              )
              .join(', ')}
            {runningOut.length > 3 && ` und ${runningOut.length - 3} weitere`}. Ohne Verlängerung
            bleibt die Planung danach leer.
          </p>
          <div className="mt-3">
            <ExtendHorizonButton action={extendScheduleHorizon} />
          </div>
        </Notice>
      )}

      {affectedAssignments.length > 0 && (
        <Notice
          tone="warning"
          className="mb-5"
          title={`${affectedAssignments.length} ${affectedAssignments.length === 1 ? 'Einsatz ist' : 'Einsätze sind'} durch Urlaub oder Krankheit betroffen`}
        >
          Die Zuweisungen bleiben bestehen. Eine Vertretung legen Sie unter{' '}
          <Link
            href="/dashboard/urlaub-krankheit"
            className="font-medium text-warning underline underline-offset-4"
          >
            Urlaub &amp; Krankheit
          </Link>{' '}
          fest.
        </Notice>
      )}

      {/*
        The board is what this screen is for, so the filters must not push it
        off the first phone screen. Status stays out; customer, object and
        employee fold away until they are wanted.
      */}
      <FilterBar className="min-w-0 max-w-full">
        <input type="hidden" name="week" value={start} />
        <Select name="status" defaultValue={currentStatus} aria-label="Status">
          <option value="all">Alle Status</option>
          <option value="PLANNED">Geplant</option>
          <option value="CONFIRMED">Bestätigt</option>
          <option value="CANCELLED">Storniert</option>
        </Select>

        <details className="min-w-0 rounded-xl border border-border/80 bg-card sm:contents">
          <summary className="flex min-h-touch cursor-pointer list-none items-center justify-between px-4 text-sm font-medium sm:hidden">
            Weitere Filter
            <span className="text-xs font-normal text-muted-foreground">
              {query.customer || query.object || query.employee ? 'aktiv' : 'optional'}
            </span>
          </summary>
          <div className="grid min-w-0 gap-3 border-t border-border/70 p-3 sm:contents sm:border-0 sm:p-0">
            <Select name="customer" defaultValue={query.customer ?? ''} aria-label="Kunde">
              <option value="">Alle Kunden</option>
              {customers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
            <Select name="object" defaultValue={query.object ?? ''} aria-label="Objekt">
              <option value="">Alle Objekte</option>
              {objects.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
            <Select name="employee" defaultValue={query.employee ?? ''} aria-label="Mitarbeiter">
              <option value="">Alle Mitarbeiter</option>
              {employees.map((item) => {
                const profile = one(item.profiles);
                return (
                  <option key={item.id} value={item.id}>
                    {[profile?.first_name, profile?.last_name].filter(Boolean).join(' ')}
                  </option>
                );
              })}
            </Select>
          </div>
        </details>

        <Button type="submit" variant="outline" className="w-full sm:w-auto">
          Filtern
        </Button>
      </FilterBar>

      {/* Week navigation sits on the workspace, not in a box: it steers the board below. */}
      <nav aria-label="Woche wechseln" className="mb-3 flex items-center gap-2">
        <ButtonLink
          href={weekHref(query, addDays(start, -7))}
          variant="outline"
          size="sm"
          aria-label="Vorherige Woche"
        >
          <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
        </ButtonLink>
        <ButtonLink
          href={weekHref(query, mondayOf(today))}
          variant={thisWeek ? 'subtle' : 'outline'}
          size="sm"
          aria-current={thisWeek ? 'page' : undefined}
        >
          Diese Woche
        </ButtonLink>
        <ButtonLink
          href={weekHref(query, addDays(start, 7))}
          variant="outline"
          size="sm"
          aria-label="Nächste Woche"
        >
          <ChevronRight className="size-4 rtl:rotate-180" aria-hidden="true" />
        </ButtonLink>
      </nav>

      {/* Desktop: one continuous board, seven columns divided by hairlines. */}
      <div className="hidden overflow-hidden rounded-xl border border-border/80 bg-card shadow-card lg:block">
        <div className="grid grid-cols-7 divide-x divide-border/70 border-b border-border/80">
          {days.map((day) => {
            const isToday = day === today;
            const isWeekend = [5, 6].includes((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7);
            const count = byDay.get(day)!.length;
            return (
              <div
                key={day}
                className={cn(
                  'px-3 py-2.5',
                  isWeekend && 'bg-subtle',
                  isToday && 'bg-primary-soft',
                )}
              >
                <p
                  className={cn(
                    'text-[13px] font-semibold',
                    isToday ? 'text-primary' : 'text-foreground',
                  )}
                >
                  {weekdayShort.format(new Date(`${day}T12:00:00Z`))}
                  <span className="ms-1.5 font-normal tabular-nums text-muted-foreground">
                    {dayMonth.format(new Date(`${day}T12:00:00Z`))}
                  </span>
                </p>
                <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                  {count === 0 ? 'frei' : `${count} ${count === 1 ? 'Einsatz' : 'Einsätze'}`}
                </p>
              </div>
            );
          })}
        </div>
        <div className="grid min-h-[22rem] grid-cols-7 divide-x divide-border/70">
          {days.map((day) => {
            const dayJobs = byDay.get(day)!;
            const isWeekend = [5, 6].includes((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7);
            return (
              <div key={day} className={cn('space-y-1.5 p-2', isWeekend && 'bg-subtle/60')}>
                {dayJobs.length === 0 ? (
                  <p className="px-1 pt-1 text-xs text-muted-foreground/70">
                    <span className="sr-only">
                      {weekdayLong.format(new Date(`${day}T12:00:00Z`))}:{' '}
                    </span>
                    Keine Einsätze
                  </p>
                ) : (
                  dayJobs.map(visit)
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Phone and tablet: the same week read top to bottom, one day at a time. */}
      <div className="space-y-5 lg:hidden">
        {days.map((day) => {
          const dayJobs = byDay.get(day)!;
          const isToday = day === today;
          return (
            <section key={day} aria-labelledby={`day-${day}`}>
              <div className="mb-2 flex items-baseline gap-2">
                <h2
                  id={`day-${day}`}
                  className={cn(
                    'text-[15px] font-semibold',
                    isToday ? 'text-primary' : 'text-foreground',
                  )}
                >
                  {weekdayLong.format(new Date(`${day}T12:00:00Z`))}
                </h2>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {dayMonth.format(new Date(`${day}T12:00:00Z`))}
                </span>
                {isToday && <span className="text-xs font-medium text-primary">heute</span>}
                <span className="ms-auto text-xs tabular-nums text-muted-foreground">
                  {dayJobs.length === 0 ? 'frei' : dayJobs.length}
                </span>
              </div>
              {dayJobs.length === 0 ? (
                <p className="border-t border-border/70 pt-2 text-sm text-muted-foreground/70">
                  Keine Einsätze
                </p>
              ) : (
                <div className="space-y-2 rounded-xl border border-border/80 bg-card p-2 shadow-card">
                  {dayJobs.map(visit)}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
