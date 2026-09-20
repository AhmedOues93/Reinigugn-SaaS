import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Mail, Pencil, Phone } from 'lucide-react';
import { getEmployee, getEmployeeMonthlyWorkSummary } from '@/lib/data/employees';
import { requireStaffCompany } from '@/lib/auth';
import { BackLink, ButtonLink, DataRow, Notice, PageHeader, Section } from '@/components/ui';
import { AccountStateBadge, RoleBadge } from '@/components/member-badges';
import { StatusToggle } from '@/components/status-toggle';
import { ResendInvitation } from '@/components/resend-invitation';
import { setEmployeeActive } from '../actions';
import { startThreadWithEmployee } from '@/app/dashboard/nachrichten/actions';
import { StaffNewThreadForm } from '@/components/staff-new-thread-form';
import { Avatar, initialsOf } from '@/components/employee/avatar';
import { listMyThreads, signedAvatarUrl } from '@/lib/data/employee';
import { canManageMember } from '@/lib/member-permissions';
import { formatDate, formatDateTime } from '@/lib/format';

const languages: Record<string, string> = {
  de: 'Deutsch',
  en: 'Englisch',
  ar: 'Arabisch',
  tr: 'Türkisch',
  uk: 'Ukrainisch',
  ru: 'Russisch',
};

const employmentTypes: Record<string, string> = {
  FULL_TIME: 'Vollzeit',
  PART_TIME: 'Teilzeit',
  MINIJOB: 'Minijob',
  OTHER: 'Sonstige',
};

export default async function EmployeeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string }>;
}) {
  const { id } = await params;
  const { success } = await searchParams;
  const [{ role: actorRole, supabase }, employee] = await Promise.all([
    requireStaffCompany(),
    getEmployee(id),
  ]);
  if (!employee) notFound();

  const profile = (Array.isArray(employee.profiles) ? employee.profiles[0] : employee.profiles) as {
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    avatar_storage_path: string | null;
  } | null;
  const details = employee.employee_details?.[0];
  const invitations = employee.company_invitations ?? [];
  const lastInvitation = invitations.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )[0];
  const firstName = profile?.first_name ?? employee.invited_first_name;
  const lastName = profile?.last_name ?? employee.invited_last_name;
  const name = [firstName, lastName].filter(Boolean).join(' ') || 'Mitarbeiter';
  const phone = profile?.phone ?? employee.invited_phone;
  const canManage = canManageMember(actorRole, employee.role as 'OFFICE' | 'EMPLOYEE');

  // The avatar and the phone number are the same rows the employee maintains in
  // their own app — one source of truth, read here under the same policies.
  const [avatarUrl, threads, workMonth] = await Promise.all([
    signedAvatarUrl(supabase, profile?.avatar_storage_path ?? null),
    employee.role === 'EMPLOYEE' ? listMyThreads() : Promise.resolve([]),
    employee.role === 'EMPLOYEE'
      ? getEmployeeMonthlyWorkSummary(employee.id)
      : Promise.resolve({ monthKey: '', entries: [], workedMinutes: 0, daysWorked: 0 }),
  ]);
  const employeeThreads = threads.filter((thread) => thread.employee_member_id === employee.id);

  /*
   * The account line, which is about signing in rather than about employment.
   * An invitation that quietly ran out used to read exactly like one sent this
   * morning, so the office only learned of it when the employee rang up.
   */
  const invitationExpired =
    employee.status === 'INVITED' &&
    Boolean(lastInvitation?.expires_at) &&
    new Date(lastInvitation!.expires_at as string) <= new Date();

  const account =
    employee.status === 'INVITED'
      ? invitationExpired
        ? `Einladung am ${formatDateTime('de', lastInvitation!.expires_at as string)} abgelaufen – bitte erneut senden`
        : lastInvitation?.expires_at
          ? `Einladung gültig bis ${formatDateTime('de', lastInvitation.expires_at)}`
          : 'Einladung versendet'
      : employee.joined_at
        ? `Beigetreten am ${formatDate('de', employee.joined_at)}`
        : '—';

  return (
    <div className="mx-auto max-w-6xl">
      <BackLink href="/dashboard/mitarbeiter">Mitarbeiter</BackLink>
      {success && (
        <Notice tone="success" className="mb-5">
          {success}
        </Notice>
      )}

      <PageHeader
        media={
          <Avatar
            url={avatarUrl}
            initials={initialsOf(firstName, lastName, employee.invited_email)}
            size={64}
          />
        }
        title={name}
        meta={
          <>
            <RoleBadge role={employee.role as 'OFFICE' | 'EMPLOYEE'} />
            <AccountStateBadge
              status={employee.status as 'INVITED' | 'ACTIVE' | 'DISABLED'}
              invitationState={
                employee.status === 'ACTIVE'
                  ? 'ANGENOMMEN'
                  : invitationExpired
                    ? 'ABGELAUFEN'
                    : lastInvitation
                      ? 'GUELTIG'
                      : 'UNBEKANNT'
              }
            />
          </>
        }
        actions={
          canManage && (
            <>
              <ButtonLink
                href={`/dashboard/mitarbeiter/${employee.id}/bearbeiten`}
                variant="outline"
              >
                <Pencil className="size-4" aria-hidden="true" />
                Bearbeiten
              </ButtonLink>
              {employee.status === 'INVITED' ? (
                <ResendInvitation memberId={employee.id} />
              ) : (
                <StatusToggle
                  id={employee.id}
                  isActive={employee.status === 'ACTIVE'}
                  noun="Mitarbeiter"
                  action={setEmployeeActive}
                />
              )}
            </>
          )
        }
      />

      {employee.status === 'INVITED' && (
        <Notice tone="neutral" title="Einladung offen" className="mb-6">
          Die Stammdaten sind bereits gespeichert. Der persönliche App-Zugang wird aktiv, sobald
          der Mitarbeiter die Einladung per E-Mail annimmt.
        </Notice>
      )}

      <div className="grid items-start gap-8 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-6">
          <section className="rounded-xl border border-border/80 bg-card p-5 shadow-card">
            <h2 className="mb-4 text-[15px] font-semibold">Identität &amp; Kontakt</h2>
            <ul className="space-y-3">
              <li className="flex items-start gap-3 text-sm">
                <Mail className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="break-anywhere min-w-0">
                  {employee.invited_email ? (
                    <a
                      className="text-primary hover:underline"
                      href={`mailto:${employee.invited_email}`}
                    >
                      {employee.invited_email}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">Keine E-Mail hinterlegt</span>
                  )}
                </span>
              </li>
              <li className="flex items-start gap-3 text-sm">
                <Phone
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="break-anywhere min-w-0">
                  {phone || <span className="text-muted-foreground">Keine Telefonnummer</span>}
                </span>
              </li>
            </ul>
          </section>
          <Section title="Einladung &amp; Konto">
            <div className="rounded-xl border border-border/80 bg-card px-5 shadow-card">
              <dl className="divide-y divide-border/70">
                <DataRow label="Rolle" value={employee.role === 'OFFICE' ? 'Büro' : 'Mitarbeiter'} />
                <DataRow label="Accountstatus" value={account} />
              </dl>
            </div>
          </Section>
        </aside>

        <div className="min-w-0 space-y-8">
          <Section title="Arbeitsdaten">
            <div className="rounded-xl border border-border/80 bg-card px-5 shadow-card">
              <dl className="divide-y divide-border/70">
                <DataRow label="Personalnummer" value={details?.employee_number ?? '—'} />
                <DataRow
                  label="Beschäftigungsart"
                  value={
                    details?.employment_type
                      ? (employmentTypes[details.employment_type] ?? '—')
                      : '—'
                  }
                />
                <DataRow
                  label="Wochen-Sollstunden"
                  value={details?.weekly_hours != null ? `${details.weekly_hours} Stunden` : '—'}
                />
                <DataRow
                  label="Bevorzugte Sprache"
                  value={
                    details?.preferred_language
                      ? (languages[details.preferred_language] ?? '—')
                      : '—'
                  }
                />
                <DataRow
                  label="Eintrittsdatum"
                  value={
                    details?.employment_start_date
                      ? formatDate('de', details.employment_start_date)
                      : '—'
                  }
                />
                <DataRow
                  label="Austrittsdatum"
                  value={
                    details?.employment_end_date
                      ? formatDate('de', details.employment_end_date)
                      : '—'
                  }
                />
              </dl>
            </div>
            {details?.notes && (
              <p className="break-anywhere mt-4 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                {details.notes}
              </p>
            )}
          </Section>

          {employee.role === 'EMPLOYEE' && (
            <Section title="Arbeitszeit im aktuellen Monat" description="Erfasste Einsatzzeit abzüglich dokumentierter Pausen. Grundlage für die monatliche Prüfung, nicht automatisch eine Lohnabrechnung.">
              <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-border/80 bg-card shadow-card">
                <div className="p-4"><p className="text-2xl font-semibold tabular-nums">{Math.floor(workMonth.workedMinutes / 60)}:{String(workMonth.workedMinutes % 60).padStart(2, '0')}</p><p className="mt-1 text-xs text-muted-foreground">Arbeitsstunden</p></div>
                <div className="border-x border-border/70 p-4"><p className="text-2xl font-semibold tabular-nums">{workMonth.daysWorked}</p><p className="mt-1 text-xs text-muted-foreground">Arbeitstage</p></div>
                <div className="p-4"><p className="text-2xl font-semibold tabular-nums">{workMonth.entries.length}</p><p className="mt-1 text-xs text-muted-foreground">Zeiteinträge</p></div>
              </div>
              {workMonth.entries.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">Für diesen Monat wurden noch keine Arbeitszeiten erfasst.</p>
              ) : (
                <div className="mt-4 overflow-hidden rounded-xl border border-border/80 bg-card">
                  <ul className="divide-y divide-border/70">
                    {workMonth.entries.slice(0, 8).map((entry) => {
                      const job = Array.isArray(entry.jobs) ? entry.jobs[0] : entry.jobs;
                      const site = job?.cleaning_objects ? (Array.isArray(job.cleaning_objects) ? job.cleaning_objects[0] : job.cleaning_objects) : null;
                      const net = Math.max(0, Number(entry.duration_minutes ?? 0) - Number(entry.break_minutes ?? 0));
                      return <li key={entry.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm"><span className="min-w-0"><span className="block truncate font-medium">{site?.name ?? job?.title ?? 'Einsatz'}</span><span className="text-xs text-muted-foreground">{formatDate('de', entry.started_at.slice(0, 10))}</span></span><span className="shrink-0 font-medium tabular-nums">{Math.floor(net / 60)}:{String(net % 60).padStart(2, '0')} Std.</span></li>;
                    })}
                  </ul>
                </div>
              )}
            </Section>
          )}

          {employee.role === 'EMPLOYEE' && (
            <Section title="Unterhaltungen">
              {employeeThreads.length === 0 ? (
                <p className="rounded-xl border border-dashed border-foreground/15 px-4 py-5 text-sm text-muted-foreground">
                  Noch keine Unterhaltung mit {firstName || 'diesem Mitarbeiter'}.
                </p>
              ) : (
                <ul className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-card">
                  {employeeThreads.map((thread) => (
                    <li key={thread.id} className="border-b border-border/70 last:border-0">
                      <Link
                        href={`/dashboard/nachrichten/${thread.id}`}
                        className="group flex min-h-touch items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-primary-soft/40"
                      >
                        <span className="min-w-0">
                          <span className="block font-medium text-foreground group-hover:text-primary">
                            {thread.subject}
                          </span>
                          {thread.last_message_preview && (
                            <span className="mt-0.5 block truncate text-muted-foreground">
                              {thread.last_message_preview}
                            </span>
                          )}
                        </span>
                        {Number(thread.unread_count) > 0 && (
                          <span className="shrink-0 rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold tabular-nums text-primary">
                            {Number(thread.unread_count)}
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {canManage && (
                <div className="mt-4">
                  <StaffNewThreadForm action={startThreadWithEmployee.bind(null, employee.id)} />
                </div>
              )}
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
