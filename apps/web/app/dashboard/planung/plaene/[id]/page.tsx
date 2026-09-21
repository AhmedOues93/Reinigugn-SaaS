import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Pencil, WandSparkles } from 'lucide-react';
import { getServiceSchedule, listJobs } from '@/lib/data/jobs';
import { BackLink, ButtonLink, DataRow, Notice, PageHeader, Section } from '@/components/ui';
import { StatusBadge } from '@/components/status-badge';
import { StatusToggle } from '@/components/status-toggle';
import { JobStatusBadge } from '@/components/job-badges';
import { WeekRhythm } from '@/components/week-rhythm';
import { formatDate, formatTimeRange } from '@/lib/format';
import { berlinDateKey } from '@/lib/date';
import { setScheduleActive } from '../../actions';

function one<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export default async function ScheduleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string }>;
}) {
  const { id } = await params;
  const { success } = await searchParams;
  const schedule = await getServiceSchedule(id);
  if (!schedule) notFound();

  const upcoming = await listJobs({ from: berlinDateKey(), status: 'all' });
  const jobs = upcoming.filter((job) => job.service_schedule_id === id).slice(0, 8);
  const customer = one(schedule.customers);
  const object = one(schedule.cleaning_objects);
  const team = schedule.service_schedule_assignments
    .map((assignment) => {
      const profile = one(one(assignment.company_members)?.profiles);
      return [profile?.first_name, profile?.last_name].filter(Boolean).join(' ');
    })
    .filter(Boolean);
  const activeRules = schedule.schedule_rules.filter((rule) => rule.is_active !== false);
  const setupPending = !schedule.is_active && activeRules.length === 0;

  return (
    <div className="mx-auto max-w-5xl">
      <BackLink href="/dashboard/planung/plaene">Wiederkehrende Pläne</BackLink>
      {success && (
        <Notice tone="success" className="mb-5">
          {success}
        </Notice>
      )}

      <PageHeader
        title={schedule.name}
        description={schedule.description ?? undefined}
        meta={
          <>
            {setupPending ? <span className="rounded-full bg-warning-soft px-2.5 py-1 text-xs font-medium text-warning">Planung offen</span> : <StatusBadge isActive={schedule.is_active} />}
            <span className="text-sm text-muted-foreground">
              {[customer?.name, object?.name].filter(Boolean).join(' · ') || 'Keine Zuordnung'}
            </span>
          </>
        }
        actions={
          <>
            <ButtonLink href={`/dashboard/planung/plaene/${id}/bearbeiten`} variant={setupPending ? 'default' : 'outline'}>
              {setupPending ? <WandSparkles className="size-4" aria-hidden="true" /> : <Pencil className="size-4" aria-hidden="true" />}
              {setupPending ? 'Planung einrichten' : 'Bearbeiten'}
            </ButtonLink>
            <StatusToggle
              id={id}
              isActive={schedule.is_active}
              noun="Plan"
              action={setScheduleActive}
            />
          </>
        }
      />

      {setupPending && (
        <Notice tone="warning" className="mb-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold">Angebot angenommen – Planung noch offen</p>
              <p className="mt-1 text-sm">
                Lege Wochentage, Uhrzeiten und Stammbesetzung fest. Erst danach erzeugt ReinPlan die Einsätze für das Team.
              </p>
            </div>
            <ButtonLink href={`/dashboard/planung/plaene/${id}/bearbeiten`}>
              Planung einrichten
            </ButtonLink>
          </div>
        </Notice>
      )}

      {schedule.is_active && team.length === 0 && (
        <Notice tone="warning" className="mb-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold">Noch keine Stammbesetzung</p>
              <p className="mt-1 text-sm">Der Plan ist aktiv und erzeugt Einsätze, aber es ist noch kein festes Team hinterlegt.</p>
            </div>
            <ButtonLink href={`/dashboard/planung/plaene/${id}/bearbeiten`} variant="outline">
              Team zuweisen
            </ButtonLink>
          </div>
        </Notice>
      )}

      <div className="grid items-start gap-8 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-6">
          <section className="rounded-xl border border-border/80 bg-card p-5 shadow-card">
            <h2 className="mb-4 text-[15px] font-semibold">Rhythmus</h2>
            {activeRules.length > 0 ? (
              <WeekRhythm rules={activeRules} />
            ) : (
              <p className="text-sm text-muted-foreground">Noch kein Rhythmus festgelegt.</p>
            )}
            <dl className="mt-5 divide-y divide-border/70 border-t border-border/70">
              <DataRow label="Gültig ab" value={formatDate('de', schedule.valid_from)} />
              <DataRow
                label="Gültig bis"
                value={
                  schedule.valid_until ? formatDate('de', schedule.valid_until) : 'Unbefristet'
                }
              />
            </dl>
          </section>

          <section className="rounded-xl border border-border/80 bg-card p-5 shadow-card">
            <h2 className="mb-3 text-[15px] font-semibold">Stammbesetzung</h2>
            {team.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine feste Besetzung hinterlegt.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {team.map((name) => (
                  <li key={name} className="break-anywhere font-medium text-foreground">
                    {name}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>

        <div className="min-w-0">
          <Section
            title="Nächste erzeugte Aufträge"
            description={jobs.length > 0 ? 'Aus diesem Plan im Voraus angelegt.' : undefined}
            action={
              jobs.length > 0 && (
                <Link
                  href="/dashboard/auftraege"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Alle Aufträge
                </Link>
              )
            }
          >
            {jobs.length === 0 ? (
              <p className="rounded-xl border border-dashed border-foreground/15 px-4 py-6 text-sm text-muted-foreground">
                {schedule.is_active
                  ? 'Für diesen Plan stehen noch keine Einsätze an.'
                  : 'Der Plan ist archiviert und erzeugt keine neuen Einsätze.'}
              </p>
            ) : (
              <ul className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-card">
                {jobs.map((job) => (
                  <li key={job.id} className="border-b border-border/70 last:border-0">
                    <Link
                      href={`/dashboard/auftraege/${job.id}`}
                      className="group flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-primary-soft/40"
                    >
                      <span className="w-24 shrink-0 text-sm font-medium tabular-nums">
                        {formatDate('de', job.scheduled_date)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground group-hover:text-primary">
                          {job.title}
                        </span>
                        <span className="block text-xs tabular-nums text-muted-foreground">
                          {formatTimeRange('de', job.planned_start_at, job.planned_end_at)}
                        </span>
                      </span>
                      <JobStatusBadge status={job.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
