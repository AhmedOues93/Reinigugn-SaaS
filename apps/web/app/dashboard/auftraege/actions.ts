'use server';

import { revalidatePath } from 'next/cache';
import { jobSchema } from '@reinigung/validation';
import { type FormState } from '@/lib/actions';
import { requireStaffCompany } from '@/lib/auth';
import { berlinDateTimeToIso } from '@/lib/date';

type AssignmentConflict = {
  job_id: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  planned_start_at: string;
  planned_end_at: string;
};

type CapacityWarning = {
  member_id: string;
  member_name: string;
  weekly_hours: number;
  planned_minutes: number;
  added_minutes: number;
};

type Supabase = Awaited<ReturnType<typeof requireStaffCompany>>['supabase'];

function failure(message: string): FormState { return { status: 'error', message }; }
function withMembers(formData: FormData) { return { ...Object.fromEntries(formData), member_ids: formData.getAll('member_ids').filter(Boolean) }; }
function asLocalIso(date: string, time: string) { return berlinDateTimeToIso(date, time); }

function personName(conflict: AssignmentConflict) {
  return `${conflict.first_name ?? ''} ${conflict.last_name ?? ''}`.trim() || 'Ein Mitarbeiter';
}

const clockTime = new Intl.DateTimeFormat('de-DE', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Berlin',
});
const dayMonth = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Europe/Berlin',
});

function deHours(minutes: number) {
  return (Math.round((minutes / 60) * 10) / 10).toLocaleString('de-DE');
}

/**
 * The warning the office has to confirm, said concretely.
 *
 * A generic "someone is already booked" cannot be acted on: it hides which
 * person, which job and which hours. Both guards stay warnings rather than
 * refusals, because standing in for a sick colleague is a legitimate override –
 * it just must never happen silently.
 */
function assignmentWarning(conflicts: AssignmentConflict[], capacity: CapacityWarning[]) {
  const lines = [
    ...conflicts.map(
      (conflict) =>
        `${personName(conflict)} ist am ${dayMonth.format(new Date(conflict.planned_start_at))} von ${clockTime.format(new Date(conflict.planned_start_at))} bis ${clockTime.format(new Date(conflict.planned_end_at))} bereits für „${conflict.title ?? 'einen anderen Auftrag'}" eingeteilt.`,
    ),
    ...capacity.map(
      (warning) =>
        `${warning.member_name} kommt in dieser Woche auf ${deHours(Number(warning.planned_minutes) + Number(warning.added_minutes))} h und liegt damit über den ${deHours(Number(warning.weekly_hours) * 60)} h Wochensoll.`,
    ),
  ];
  return lines.join(' ');
}

async function conflictsForJob(companyId: string, value: ReturnType<typeof jobSchema.parse>, supabase: Supabase) {
  if (value.member_ids.length === 0) return [];
  const { data } = await supabase.rpc('find_job_assignment_conflicts', { p_company_id: companyId, p_start: asLocalIso(value.scheduled_date, value.planned_start_time), p_end: asLocalIso(value.scheduled_date, value.planned_end_time), p_member_ids: value.member_ids });
  return (data ?? []) as AssignmentConflict[];
}

async function capacityForJob(companyId: string, value: ReturnType<typeof jobSchema.parse>, supabase: Supabase, excludeJobId: string | null) {
  if (value.member_ids.length === 0) return [];
  const { data } = await supabase.rpc('find_job_capacity_warnings', {
    p_company_id: companyId,
    p_date: value.scheduled_date,
    p_start: asLocalIso(value.scheduled_date, value.planned_start_time),
    p_end: asLocalIso(value.scheduled_date, value.planned_end_time),
    p_member_ids: value.member_ids,
    p_exclude_job: excludeJobId,
  });
  return (data ?? []) as CapacityWarning[];
}

export async function createJob(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = jobSchema.safeParse(withMembers(formData));
  if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? 'Bitte prüfe deine Eingaben.');
  try {
    const { supabase, company } = await requireStaffCompany();
    const [conflicts, capacity] = await Promise.all([
      conflictsForJob(company.id, parsed.data, supabase),
      capacityForJob(company.id, parsed.data, supabase, null),
    ]);
    if ((conflicts.length || capacity.length) && !parsed.data.confirm_conflicts) {
      return { status: 'error', message: 'Bitte bestätige den Hinweis, wenn du den Auftrag trotzdem speichern möchtest.', conflictWarning: assignmentWarning(conflicts, capacity) };
    }
    const { data, error } = await supabase.rpc('create_single_job', {
      p_customer_id: parsed.data.customer_id, p_cleaning_object_id: parsed.data.cleaning_object_id, p_title: parsed.data.title, p_description: parsed.data.description ?? '', p_scheduled_date: parsed.data.scheduled_date,
      p_start_time: parsed.data.planned_start_time, p_end_time: parsed.data.planned_end_time, p_status: parsed.data.status, p_priority: parsed.data.priority, p_internal_notes: parsed.data.internal_notes ?? '', p_employee_instructions: parsed.data.employee_instructions ?? '', p_member_ids: parsed.data.member_ids, p_checklist_template_id: parsed.data.checklist_template_id ?? null,
    });
    if (error || !data) return failure('Der Auftrag konnte nicht erstellt werden.');
    revalidatePath('/dashboard'); revalidatePath('/dashboard/auftraege'); revalidatePath('/dashboard/planung');
    return { status: 'success', id: data as string };
  } catch { return failure('Der Auftrag konnte nicht erstellt werden.'); }
}

export async function updateJob(jobId: string, _: FormState, formData: FormData): Promise<FormState> {
  const parsed = jobSchema.safeParse(withMembers(formData));
  if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? 'Bitte prüfe deine Eingaben.');
  try {
    const { supabase, company } = await requireStaffCompany();
    const [conflicts, capacity] = await Promise.all([
      conflictsForJob(company.id, parsed.data, supabase),
      capacityForJob(company.id, parsed.data, supabase, jobId),
    ]);
    // Moving a job must not warn about the job being moved.
    const relevant = conflicts.filter((conflict: AssignmentConflict) => conflict.job_id !== jobId);
    if ((relevant.length || capacity.length) && !parsed.data.confirm_conflicts) {
      return { status: 'error', message: 'Bitte bestätige den Hinweis, wenn du den Auftrag trotzdem speichern möchtest.', conflictWarning: assignmentWarning(relevant, capacity) };
    }
    const { error } = await supabase.rpc('update_job_details', {
      p_job_id: jobId, p_customer_id: parsed.data.customer_id, p_cleaning_object_id: parsed.data.cleaning_object_id, p_title: parsed.data.title, p_description: parsed.data.description ?? '', p_scheduled_date: parsed.data.scheduled_date,
      p_start_time: parsed.data.planned_start_time, p_end_time: parsed.data.planned_end_time, p_status: parsed.data.status, p_priority: parsed.data.priority, p_internal_notes: parsed.data.internal_notes ?? '', p_employee_instructions: parsed.data.employee_instructions ?? '', p_member_ids: parsed.data.member_ids, p_checklist_template_id: parsed.data.checklist_template_id ?? null,
    });
    if (error) return failure('Der Auftrag konnte nicht aktualisiert werden.');
    revalidatePath('/dashboard'); revalidatePath('/dashboard/auftraege'); revalidatePath(`/dashboard/auftraege/${jobId}`); revalidatePath('/dashboard/planung');
    return { status: 'success', id: jobId };
  } catch { return failure('Der Auftrag konnte nicht aktualisiert werden.'); }
}

export async function deleteOperationalJobPhoto(photoId: string, _: FormState, __: FormData): Promise<FormState> {
  try {
    const { supabase } = await requireStaffCompany();
    const { data: path, error } = await supabase.rpc('delete_job_photo', { p_photo_id: photoId });
    if (error || !path) return failure('Das Foto konnte nicht entfernt werden.');
    const { error: storageError } = await supabase.storage.from('job-photos').remove([path]);
    if (storageError) return failure('Das Foto konnte nicht entfernt werden.');
    revalidatePath('/dashboard/auftraege');
    return { status: 'success', message: 'Foto wurde entfernt.' };
  } catch { return failure('Das Foto konnte nicht entfernt werden.'); }
}
