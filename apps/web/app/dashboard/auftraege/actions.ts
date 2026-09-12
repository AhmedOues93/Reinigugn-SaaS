'use server';

import { revalidatePath } from 'next/cache';
import { jobSchema } from '@reinigung/validation';
import { type FormState } from '@/lib/actions';
import { requireStaffCompany } from '@/lib/auth';

type AssignmentConflict = { job_id: string; first_name: string | null; last_name: string | null };

function failure(message: string): FormState { return { status: 'error', message }; }
function withMembers(formData: FormData) { return { ...Object.fromEntries(formData), member_ids: formData.getAll('member_ids').filter(Boolean) }; }
function asLocalIso(date: string, time: string) { return new Date(`${date}T${time}:00`).toISOString(); }

async function conflictsForJob(companyId: string, value: ReturnType<typeof jobSchema.parse>, supabase: Awaited<ReturnType<typeof requireStaffCompany>>['supabase']) {
  if (value.member_ids.length === 0) return [];
  const { data } = await supabase.rpc('find_job_assignment_conflicts', { p_company_id: companyId, p_start: asLocalIso(value.scheduled_date, value.planned_start_time), p_end: asLocalIso(value.scheduled_date, value.planned_end_time), p_member_ids: value.member_ids });
  return (data ?? []) as AssignmentConflict[];
}

export async function createJob(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = jobSchema.safeParse(withMembers(formData));
  if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? 'Bitte pruefe deine Eingaben.');
  try {
    const { supabase, company } = await requireStaffCompany();
    const conflicts = await conflictsForJob(company.id, parsed.data, supabase);
    if (conflicts.length && !parsed.data.confirm_conflicts) {
      const names = [...new Set(conflicts.map((conflict: AssignmentConflict) => `${conflict.first_name ?? ''} ${conflict.last_name ?? ''}`.trim()))].join(', ');
      return { status: 'error', message: 'Bitte bestaetige die Konfliktwarnung, wenn du den Auftrag trotzdem speichern moechtest.', conflictWarning: `${names} ist zu diesem Zeitpunkt bereits einem anderen Auftrag zugeordnet.` };
    }
    const { data, error } = await supabase.rpc('create_single_job', {
      p_customer_id: parsed.data.customer_id, p_cleaning_object_id: parsed.data.cleaning_object_id, p_title: parsed.data.title, p_description: parsed.data.description ?? '', p_scheduled_date: parsed.data.scheduled_date,
      p_start_time: parsed.data.planned_start_time, p_end_time: parsed.data.planned_end_time, p_status: parsed.data.status, p_priority: parsed.data.priority, p_internal_notes: parsed.data.internal_notes ?? '', p_employee_instructions: parsed.data.employee_instructions ?? '', p_member_ids: parsed.data.member_ids,
    });
    if (error || !data) return failure('Der Auftrag konnte nicht erstellt werden.');
    revalidatePath('/dashboard'); revalidatePath('/dashboard/auftraege'); revalidatePath('/dashboard/planung');
    return { status: 'success', id: data as string };
  } catch { return failure('Der Auftrag konnte nicht erstellt werden.'); }
}

export async function updateJob(jobId: string, _: FormState, formData: FormData): Promise<FormState> {
  const parsed = jobSchema.safeParse(withMembers(formData));
  if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? 'Bitte pruefe deine Eingaben.');
  try {
    const { supabase, company } = await requireStaffCompany();
    const conflicts = await conflictsForJob(company.id, parsed.data, supabase);
    const relevant = conflicts.filter((conflict: AssignmentConflict) => conflict.job_id !== jobId);
    if (relevant.length && !parsed.data.confirm_conflicts) return { status: 'error', message: 'Bitte bestaetige die Konfliktwarnung, wenn du den Auftrag trotzdem speichern moechtest.', conflictWarning: 'Mindestens ein Mitarbeiter ist zu diesem Zeitpunkt bereits einem anderen Auftrag zugeordnet.' };
    const { error } = await supabase.rpc('update_job_details', {
      p_job_id: jobId, p_customer_id: parsed.data.customer_id, p_cleaning_object_id: parsed.data.cleaning_object_id, p_title: parsed.data.title, p_description: parsed.data.description ?? '', p_scheduled_date: parsed.data.scheduled_date,
      p_start_time: parsed.data.planned_start_time, p_end_time: parsed.data.planned_end_time, p_status: parsed.data.status, p_priority: parsed.data.priority, p_internal_notes: parsed.data.internal_notes ?? '', p_employee_instructions: parsed.data.employee_instructions ?? '', p_member_ids: parsed.data.member_ids,
    });
    if (error) return failure('Der Auftrag konnte nicht aktualisiert werden.');
    revalidatePath('/dashboard'); revalidatePath('/dashboard/auftraege'); revalidatePath(`/dashboard/auftraege/${jobId}`); revalidatePath('/dashboard/planung');
    return { status: 'success', id: jobId };
  } catch { return failure('Der Auftrag konnte nicht aktualisiert werden.'); }
}
