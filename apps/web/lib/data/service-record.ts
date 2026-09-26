import { requireStaffCompany } from '@/lib/auth';
import { listStaffJobPhotos, type JobPhoto } from '@/lib/data/job-photos';

function first<T>(value: T | T[] | null | undefined) { return Array.isArray(value) ? value[0] ?? null : value ?? null; }
function personName(member: { profiles: { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null } | null | undefined) {
  const profile = member ? first(member.profiles) : null;
  return [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Mitarbeiter';
}

export type ServiceRecord = {
  company: { name: string; street: string | null; postal_code: string | null; city: string | null; country: string | null };
  job: { id: string; title: string; status: string; scheduled_date: string; planned_start_at: string; planned_end_at: string; employee_instructions: string | null; internal_notes: string | null; customer: { name: string } | null; object: { name: string; street: string | null; postal_code: string | null; city: string | null; country: string | null } | null };
  assignments: { id: string; name: string }[];
  timeEntries: { id: string; memberId: string; name: string; startedAt: string; finishedAt: string | null; durationMinutes: number | null }[];
  checklistItems: { id: string; position: number; title: string; instruction: string | null; isRequired: boolean; completedAt: string | null; completedBy: string | null }[];
  photos: JobPhoto[];
};

export async function getServiceRecord(jobId: string): Promise<ServiceRecord | null> {
  const { supabase, company } = await requireStaffCompany();
  const { data: job, error: jobError } = await supabase.from('jobs')
    .select('id, title, status, scheduled_date, planned_start_at, planned_end_at, employee_instructions, internal_notes, customers(name), cleaning_objects(name, street, postal_code, city, country)')
    .eq('company_id', company.id).eq('id', jobId).maybeSingle();
  if (jobError) throw new Error('Leistungsnachweis konnte nicht geladen werden.');
  if (!job) return null;

  const [{ data: companyData, error: companyError }, { data: assignments, error: assignmentError }, { data: timeEntries, error: timeError }, { data: checklists, error: checklistError }, photos] = await Promise.all([
    supabase.from('companies').select('name, street, postal_code, city, country').eq('id', company.id).single(),
    supabase.from('job_assignments').select('member_id, company_members!job_assignments_member_id_fkey(profiles!company_members_profile_id_fkey(first_name, last_name))').eq('job_id', job.id),
    supabase.from('job_time_entries').select('id, member_id, started_at, finished_at, duration_minutes, company_members!job_time_entries_member_id_fkey(profiles!company_members_profile_id_fkey(first_name, last_name))').eq('job_id', job.id).order('started_at'),
    supabase.from('job_checklists').select('job_checklist_items(id, position, title, instruction, is_required, completed_at, completed_by, company_members!job_checklist_items_completed_by_fkey(profiles!company_members_profile_id_fkey(first_name, last_name)))').eq('job_id', job.id).maybeSingle(),
    listStaffJobPhotos(job.id),
  ]);
  if (companyError || assignmentError || timeError || checklistError) throw new Error('Leistungsnachweis konnte nicht geladen werden.');

  const customer = first(job.customers); const object = first(job.cleaning_objects);
  const checklistItems = (checklists?.job_checklist_items ?? []).map((item) => ({ id: item.id, position: item.position, title: item.title, instruction: item.instruction, isRequired: item.is_required, completedAt: item.completed_at, completedBy: item.completed_at ? personName(first(item.company_members)) : null })).sort((a, b) => a.position - b.position);
  return {
    company: companyData ?? { name: company.name, street: null, postal_code: null, city: null, country: null },
    job: { id: job.id, title: job.title, status: job.status, scheduled_date: job.scheduled_date, planned_start_at: job.planned_start_at, planned_end_at: job.planned_end_at, employee_instructions: job.employee_instructions, internal_notes: job.internal_notes, customer, object },
    assignments: (assignments ?? []).map((assignment) => ({ id: assignment.member_id, name: personName(first(assignment.company_members)) })),
    timeEntries: (timeEntries ?? []).map((entry) => ({ id: entry.id, memberId: entry.member_id, name: personName(first(entry.company_members)), startedAt: entry.started_at, finishedAt: entry.finished_at, durationMinutes: entry.duration_minutes })),
    checklistItems,
    photos,
  };
}


/** A Leistungsnachweis exists only after the operational workflow created its immutable record. */
export async function hasStoredServiceRecord(jobId: string): Promise<boolean> {
  const { supabase, company } = await requireStaffCompany();
  const { data, error } = await supabase
    .from('service_records')
    .select('id')
    .eq('company_id', company.id)
    .eq('job_id', jobId)
    .maybeSingle();
  if (error) throw new Error('Leistungsnachweis konnte nicht geprüft werden.');
  return Boolean(data?.id);
}
