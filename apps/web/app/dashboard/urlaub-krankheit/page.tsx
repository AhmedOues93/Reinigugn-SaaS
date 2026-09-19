import Link from 'next/link';
import { Badge, Card, EmptyState, Select } from '@/components/ui';
import { SubmitButton } from '@/components/form-controls';
import { requireStaffCompany } from '@/lib/auth';
import { listAffectedAssignments } from '@/lib/data/absences';
import { reassignAffectedJob, reviewAbsence } from './actions';

type Absence = {
  id: string;
  member_id: string;
  absence_type: 'VACATION' | 'SICKNESS';
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  start_date: string;
  end_date: string;
  note: string | null;
  au_storage_path: string | null;
  company_members: { profiles: { first_name: string | null; last_name: string | null } | null } | null;
};

const statusLabel: Record<Absence['status'], string> = { PENDING: 'Offen', APPROVED: 'Genehmigt', REJECTED: 'Abgelehnt' };

export default async function AbsencePage() {
  const { supabase, company } = await requireStaffCompany();
  const staff = true;
  const query = supabase.from('employee_absences').select('id, member_id, absence_type, status, start_date, end_date, note, au_storage_path, company_members!employee_absences_member_id_fkey(profiles!company_members_profile_id_fkey(first_name,last_name))').order('created_at', { ascending: false });
  const { data: rawAbsences, error } = await query.eq('company_id', company.id);
  if (error) throw new Error('Abwesenheiten konnten nicht geladen werden.');
  const absences = (rawAbsences ?? []) as unknown as Absence[];
  const affectedAssignments = staff ? await listAffectedAssignments() : [];
  const documentUrls = new Map<string, string>();
  for (const absence of absences) {
    if (!absence.au_storage_path) continue;
    const { data } = await supabase.storage.from('absence-documents').createSignedUrl(absence.au_storage_path, 300);
    if (data?.signedUrl) documentUrls.set(absence.id, data.signedUrl);
  }

  return <div className="mx-auto max-w-5xl space-y-6">
    <div><h1 className="text-[1.75rem] font-semibold leading-tight">Urlaub & Krankheit</h1><p className="mt-2 text-muted-foreground">Operative Abwesenheiten und ihre Auswirkungen auf die Planung.</p></div>
    {staff && <Card className="overflow-hidden"><div className="border-b p-5"><h2 className="font-semibold">Betroffene Aufträge</h2><p className="mt-1 text-sm text-muted-foreground">Zuweisungen bleiben erhalten, bis Sie bewusst eine Vertretung festlegen.</p></div>{affectedAssignments.length === 0 ? <EmptyState title="Keine betroffenen Aufträge" body="Keine kommenden Aufträge sind von einer Abwesenheit betroffen." /> : <div className="divide-y">{affectedAssignments.map((assignment) => <div className="flex flex-wrap items-center justify-between gap-4 p-5" key={`${assignment.jobId}-${assignment.memberId}`}><div><Link className="inline-flex min-h-touch items-center font-medium text-primary hover:underline" href={`/dashboard/auftraege/${assignment.jobId}`}>{assignment.jobTitle}</Link><p className="mt-1 text-sm text-muted-foreground">{assignment.scheduledDate} · {assignment.employeeName} ({assignment.absenceType === 'VACATION' ? 'Urlaub' : 'Krankheit'})</p></div>{assignment.candidates.length === 0 ? <p className="text-sm text-warning">Keine verfügbare Vertretung gefunden.</p> : <form action={reassignAffectedJob.bind(null, assignment.jobId, assignment.memberId)} className="flex flex-wrap items-center gap-2"><Select name="replacement_member_id" required defaultValue=""><option value="" disabled>Vertretung auswählen</option>{assignment.candidates.map((candidate) => <option key={candidate.memberId} value={candidate.memberId}>{[candidate.firstName, candidate.lastName].filter(Boolean).join(' ')}</option>)}</Select><SubmitButton>Neu zuweisen</SubmitButton></form>}</div>)}</div>}</Card>}
    <Card className="overflow-hidden"><div className="border-b p-5"><h2 className="font-semibold">Abwesenheiten</h2></div>{absences.length === 0 ? <EmptyState title="Keine Abwesenheiten" body="Keine Abwesenheiten vorhanden." /> : <div className="divide-y">{absences.map((absence) => {
      const profile = absence.company_members?.profiles;
      const documentUrl = documentUrls.get(absence.id);
      const statusTone = absence.status === 'APPROVED' ? 'success' : absence.status === 'REJECTED' ? 'danger' : 'neutral';
      return <div className="flex flex-wrap items-center justify-between gap-3 p-5" key={absence.id}><div><p className="font-medium">{absence.absence_type === 'VACATION' ? 'Urlaub' : 'Krankheit'} · {absence.start_date} bis {absence.end_date}</p>{staff && <p className="mt-1 text-sm text-muted-foreground">{[profile?.first_name, profile?.last_name].filter(Boolean).join(' ')}</p>}<p className="mt-1"><Badge tone={statusTone}>{statusLabel[absence.status]}</Badge></p>{absence.note && <p className="mt-1 text-sm text-muted-foreground">{absence.note}</p>}{documentUrl && <a className="inline-flex min-h-touch items-center mt-3 inline-block text-sm font-medium text-primary hover:underline" href={documentUrl} target="_blank" rel="noreferrer">AU-Dokument anzeigen</a>}</div>{staff && absence.absence_type === 'VACATION' && absence.status === 'PENDING' && <div className="flex gap-2"><form action={reviewAbsence.bind(null, absence.id, true)}><SubmitButton>Genehmigen</SubmitButton></form><form action={reviewAbsence.bind(null, absence.id, false)}><SubmitButton variant="outline">Ablehnen</SubmitButton></form></div>}</div>;
    })}</div>}</Card>
  </div>;
}
