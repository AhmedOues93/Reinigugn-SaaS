import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Mail, Pencil, Phone } from 'lucide-react';
import { getEmployee } from '@/lib/data/employees';
import { requireStaffCompany } from '@/lib/auth';
import { BackLink, ButtonLink, DataRow, Notice, PageHeader, Section } from '@/components/ui';
import { MemberStatusBadge, RoleBadge } from '@/components/member-badges';
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
  const [avatarUrl, threads] = await Promise.all([
    signedAvatarUrl(supabase, profile?.avatar_storage_path ?? null),
    employee.role === 'EMPLOYEE' ? listMyThreads() : Promise.resolve([]),
  ]);
  const employeeThreads = threads.filter((thread) => thread.employee_member_id === employee.id);

  const account =
    employee.status === 'INVITED'
      ? lastInvitation?.expires_at
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
            <MemberStatusBadge status={employee.status as 'INVITED' | 'ACTIVE' | 'DISABLED'} />
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

      <div className="grid items-start gap-8 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-6">
          <section className="rounded-xl border border-border/80 bg-card p-5 shadow-card">
            <h2 className="mb-4 text-[15px] font-semibold">Kontakt</h2>
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
            <dl className="mt-5 divide-y divide-border/70 border-t border-border/70">
              <DataRow label="Rolle" value={employee.role === 'OFFICE' ? 'Büro' : 'Mitarbeiter'} />
              <DataRow label="Account" value={account} />
            </dl>
          </section>
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
