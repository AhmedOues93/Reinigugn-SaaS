import Link from 'next/link';
import { CalendarDays, CalendarOff, ClipboardCheck, ExternalLink, Stethoscope, Umbrella } from 'lucide-react';
import { cn } from '@reinigung/ui';
import { Badge, EmptyState, PageHeader, Section, Select, type Tone } from '@/components/ui';
import { SubmitButton } from '@/components/form-controls';
import { AbsenceReviewActions } from '@/components/absence-review-actions';
import { requireStaffCompany } from '@/lib/auth';
import { listAffectedAssignments } from '@/lib/data/absences';
import { formatDate, formatDateTime } from '@/lib/format';
import { reassignAffectedJob, reviewAbsence } from './actions';

type Absence = {
  id: string;
  member_id: string;
  absence_type: 'VACATION' | 'SICKNESS';
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  decision: 'REPORTED' | 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewed_at: string | null;
  review_note: string | null;
  start_date: string;
  end_date: string;
  note: string | null;
  au_storage_path: string | null;
  company_members: {
    profiles: { first_name: string | null; last_name: string | null } | null;
  } | null;
};

/*
 * What the office actually did, not what the row's status column says.
 *
 * A sickness is stored APPROVED so planning treats the day as unavailable, but
 * nobody approves an illness — showing "Genehmigt" against an absence an
 * employee just reported is what made vacation look auto-approved.
 */
const decisionLabel: Record<Absence['decision'], string> = {
  REPORTED: 'Gemeldet',
  PENDING: 'Offen',
  APPROVED: 'Genehmigt',
  REJECTED: 'Abgelehnt',
};
const decisionTone: Record<Absence['decision'], Tone> = {
  REPORTED: 'info',
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
};

export default async function AbsencePage() {
  const { supabase, company } = await requireStaffCompany();
  const { data: rawAbsences, error } = await supabase
    .from('employee_absences')
    .select(
      'id, member_id, absence_type, status, decision, reviewed_at, review_note, start_date, end_date, note, au_storage_path, company_members!employee_absences_member_id_fkey(profiles!company_members_profile_id_fkey(first_name,last_name))',
    )
    .eq('company_id', company.id)
    .order('created_at', { ascending: false });
  if (error) throw new Error('Abwesenheiten konnten nicht geladen werden.');

  const absences = (rawAbsences ?? []) as unknown as Absence[];
  const affectedAssignments = await listAffectedAssignments();

  const documentUrls = new Map<string, string>();
  for (const absence of absences) {
    if (!absence.au_storage_path) continue;
    const { data } = await supabase.storage
      .from('absence-documents')
      .createSignedUrl(absence.au_storage_path, 300);
    if (data?.signedUrl) documentUrls.set(absence.id, data.signedUrl);
  }

  // What the office has to decide comes before what it has already decided.
  const pending = absences.filter((absence) => absence.status === 'PENDING');
  const decided = absences.filter((absence) => absence.status !== 'PENDING');

  const absenceRow = (absence: Absence) => {
    const profile = absence.company_members?.profiles;
    const documentUrl = documentUrls.get(absence.id);
    const isVacation = absence.absence_type === 'VACATION';
    const Icon = isVacation ? Umbrella : Stethoscope;
    const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ');

    return (
      <li key={absence.id} className="border-b border-border/70 last:border-0">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 px-4 py-4 sm:px-5">
          <div className="flex min-w-0 flex-1 gap-3">
            <span
              className={cn(
                'grid size-9 shrink-0 place-items-center rounded-lg',
                isVacation ? 'bg-info-soft text-info' : 'bg-warning-soft text-warning',
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="break-anywhere font-medium text-foreground">{name || 'Mitarbeiter'}</p>
              <p className="mt-0.5 text-sm tabular-nums text-muted-foreground">
                {isVacation ? 'Urlaub' : 'Krankheit'} · {formatDate('de', absence.start_date)} –{' '}
                {formatDate('de', absence.end_date)}
              </p>
              {absence.note && (
                <p className="break-anywhere mt-1.5 text-sm leading-6 text-muted-foreground">
                  {absence.note}
                </p>
              )}
              {absence.review_note && (
                <p className="break-anywhere mt-2 rounded-lg bg-muted/40 px-3 py-2 text-sm leading-6 text-muted-foreground">
                  Entscheidung: {absence.review_note}
                </p>
              )}
              {documentUrl && (
                <a
                  className="mt-2 inline-flex min-h-touch items-center gap-1.5 text-sm font-medium text-primary hover:underline md:min-h-9"
                  href={documentUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  AU-Dokument anzeigen
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                </a>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <span className="flex flex-col items-end gap-1">
              <Badge tone={decisionTone[absence.decision]}>{decisionLabel[absence.decision]}</Badge>
              {absence.reviewed_at && (
                <span className="text-xs tabular-nums text-muted-foreground">
                  {formatDateTime('de', absence.reviewed_at)}
                </span>
              )}
            </span>
            {isVacation && absence.status === 'PENDING' && (
              <AbsenceReviewActions
                approveAction={reviewAbsence.bind(null, absence.id, true)}
                rejectAction={reviewAbsence.bind(null, absence.id, false)}
              />
            )}
          </div>
        </div>
      </li>
    );
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader
        title="Urlaub &amp; Krankheit"
        description="Abwesenheiten freigeben und die Einsätze auffangen, die dadurch ohne Besetzung dastehen."
        meta={
          <>
            {pending.length > 0 && (
              <Badge tone="warning">
                {pending.length} {pending.length === 1 ? 'offener Antrag' : 'offene Anträge'}
              </Badge>
            )}
            {affectedAssignments.length > 0 && (
              <Badge tone="danger">
                {affectedAssignments.length}{' '}
                {affectedAssignments.length === 1 ? 'Einsatz betroffen' : 'Einsätze betroffen'}
              </Badge>
            )}
          </>
        }
      />

      <Section
        title="Betroffene Aufträge"
        description="Die Zuweisung bleibt bestehen, bis hier bewusst eine Vertretung eingesetzt wird."
      >
        {affectedAssignments.length === 0 ? (
          <p className="rounded-xl border border-dashed border-foreground/15 px-4 py-6 text-sm text-muted-foreground">
            Kein kommender Einsatz ist von einer Abwesenheit betroffen.
          </p>
        ) : (
          <ul className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-card">
            {affectedAssignments.map((assignment) => (
              <li
                key={`${assignment.jobId}-${assignment.memberId}`}
                className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-border/70 px-4 py-4 last:border-0 sm:px-5"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/dashboard/auftraege/${assignment.jobId}`}
                    className="break-anywhere font-medium text-foreground hover:text-primary hover:underline"
                  >
                    {assignment.jobTitle}
                  </Link>
                  <p className="mt-0.5 text-sm tabular-nums text-muted-foreground">
                    {formatDate('de', assignment.scheduledDate)} · {assignment.employeeName} (
                    {assignment.absenceType === 'VACATION' ? 'Urlaub' : 'Krankheit'})
                  </p>
                </div>
                {assignment.candidates.length === 0 ? (
                  <p className="text-sm font-medium text-warning">Keine verfügbare Vertretung</p>
                ) : (
                  <form
                    action={reassignAffectedJob.bind(null, assignment.jobId, assignment.memberId)}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <Select
                      name="replacement_member_id"
                      required
                      defaultValue=""
                      aria-label={`Vertretung für ${assignment.jobTitle}`}
                      className="min-w-[12rem]"
                    >
                      <option value="" disabled>
                        Vertretung auswählen
                      </option>
                      {assignment.candidates.map((candidate) => (
                        <option key={candidate.memberId} value={candidate.memberId}>
                          {[candidate.firstName, candidate.lastName].filter(Boolean).join(' ')}
                        </option>
                      ))}
                    </Select>
                    <SubmitButton size="sm">Neu zuweisen</SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {pending.length > 0 && (
        <Section title="Offene Anträge">
          <ul className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-card">
            {pending.map(absenceRow)}
          </ul>
        </Section>
      )}

      <Section title={pending.length > 0 ? 'Bereits entschieden' : 'Abwesenheiten'}>
        {decided.length === 0 ? (
          pending.length === 0 ? (
            <EmptyState
              icon={<CalendarOff />}
              title="Keine Abwesenheiten erfasst"
              body="Urlaubsanträge und Krankmeldungen aus der Mitarbeiter-App erscheinen hier. Wenn sie einen geplanten Einsatz betreffen, steht die nötige Vertretung oben auf dieser Seite bereit."
              action={
                <div className="mt-5 grid w-full gap-3 text-start sm:grid-cols-2">
                  <div className="rounded-lg border border-border/80 bg-card px-3.5 py-3">
                    <CalendarDays className="size-4 text-primary" aria-hidden="true" />
                    <p className="mt-2 text-sm font-medium text-foreground">Hier erscheinen neue Meldungen</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">Mitarbeiter reichen Urlaub und Krankheit in ihrer App ein.</p>
                  </div>
                  <div className="rounded-lg border border-border/80 bg-card px-3.5 py-3">
                    <ClipboardCheck className="size-4 text-primary" aria-hidden="true" />
                    <p className="mt-2 text-sm font-medium text-foreground">Einsätze bleiben sichtbar</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">Betroffene Aufträge werden nicht automatisch umgeplant.</p>
                  </div>
                </div>
              }
            />
          ) : (
            <p className="rounded-xl border border-dashed border-foreground/15 px-4 py-6 text-sm text-muted-foreground">
              Noch nichts entschieden.
            </p>
          )
        ) : (
          <ul className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-card">
            {decided.map(absenceRow)}
          </ul>
        )}
      </Section>
    </div>
  );
}
