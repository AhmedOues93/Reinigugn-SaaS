import Link from 'next/link';
import { Plus, Repeat } from 'lucide-react';
import { cn } from '@reinigung/ui';
import { listServiceSchedules } from '@/lib/data/jobs';
import { BackLink, ButtonLink, EmptyState, PageHeader } from '@/components/ui';
import { StatusBadge } from '@/components/status-badge';
import { WeekRhythm } from '@/components/week-rhythm';

function one<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export default async function SchedulesPage() {
  const schedules = await listServiceSchedules();
  const active = schedules.filter((schedule) => schedule.is_active).length;

  return (
    <div className="mx-auto max-w-5xl">
      <BackLink href="/dashboard/planung">Planung</BackLink>
      <PageHeader
        title="Wiederkehrende Pläne"
        description="Ein Plan erzeugt die nächsten acht Wochen an Einsätzen im Voraus – ohne Doppelbuchungen."
        meta={
          schedules.length > 0 ? (
            <span className="text-sm text-muted-foreground">
              {active} aktiv
              {schedules.length > active && ` · ${schedules.length - active} archiviert`}
            </span>
          ) : undefined
        }
        actions={
          <ButtonLink href="/dashboard/planung/plaene/neu">
            <Plus className="size-4" aria-hidden="true" />
            Plan erstellen
          </ButtonLink>
        }
      />

      {schedules.length === 0 ? (
        <EmptyState
          icon={<Repeat />}
          title="Noch kein wiederkehrender Plan"
          body="Für Objekte, die regelmäßig gereinigt werden, legen Sie den Rhythmus einmal an statt jede Woche neue Aufträge zu erfassen."
          action={
            <ButtonLink href="/dashboard/planung/plaene/neu">
              <Plus className="size-4" aria-hidden="true" />
              Plan erstellen
            </ButtonLink>
          }
        />
      ) : (
        <ul className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-card">
          {schedules.map((schedule) => {
            const customer = one(schedule.customers);
            const object = one(schedule.cleaning_objects);
            return (
              <li key={schedule.id} className="border-b border-border/70 last:border-0">
                <Link
                  href={`/dashboard/planung/plaene/${schedule.id}`}
                  className={cn(
                    'group flex flex-wrap items-center gap-x-5 gap-y-3 px-4 py-4 transition-colors hover:bg-primary-soft/40 sm:px-5',
                    !schedule.is_active && 'opacity-70',
                  )}
                >
                  <span className="min-w-[12rem] flex-1">
                    <span className="break-anywhere block font-medium text-foreground group-hover:text-primary">
                      {schedule.name}
                    </span>
                    <span className="block truncate text-sm text-muted-foreground">
                      {[customer?.name, object?.name].filter(Boolean).join(' · ') ||
                        'Keine Zuordnung'}
                    </span>
                  </span>
                  <WeekRhythm rules={schedule.schedule_rules} />
                  {!schedule.is_active && <StatusBadge isActive={false} />}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
