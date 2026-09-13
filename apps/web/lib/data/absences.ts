import { requireStaffCompany } from '@/lib/auth';

export type AffectedAssignment = {
  jobId: string;
  jobTitle: string;
  scheduledDate: string;
  memberId: string;
  employeeName: string;
  absenceType: 'VACATION' | 'SICKNESS';
  candidates: { memberId: string; firstName: string; lastName: string }[];
};

type AffectedAssignmentRow = { job_id: string; job_title: string; scheduled_date: string; member_id: string; first_name: string | null; last_name: string | null; absence_type: 'VACATION' | 'SICKNESS' };
type ReplacementCandidateRow = { member_id: string; first_name: string | null; last_name: string | null };

export async function listAffectedAssignments(from?: string, to?: string): Promise<AffectedAssignment[]> {
  const { supabase } = await requireStaffCompany();
  const { data, error } = await supabase.rpc('list_absence_affected_assignments', { p_from: from ?? new Date().toISOString().slice(0, 10), p_to: to ?? null });
  if (error) throw new Error('Betroffene Aufträge konnten nicht geladen werden.');
  return Promise.all(((data ?? []) as AffectedAssignmentRow[]).map(async (item) => {
    const { data: candidates, error: candidatesError } = await supabase.rpc('list_replacement_candidates', { p_job_id: item.job_id });
    if (candidatesError) throw new Error('Vertretungsvorschläge konnten nicht geladen werden.');
    return {
      jobId: item.job_id,
      jobTitle: item.job_title,
      scheduledDate: item.scheduled_date,
      memberId: item.member_id,
      employeeName: [item.first_name, item.last_name].filter(Boolean).join(' '),
      absenceType: item.absence_type,
      candidates: ((candidates ?? []) as ReplacementCandidateRow[]).map((candidate) => ({ memberId: candidate.member_id, firstName: candidate.first_name ?? '', lastName: candidate.last_name ?? '' })),
    };
  }));
}
