'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentCompany, requireStaffCompany } from '@/lib/auth';
import { type FormState } from '@/lib/actions';
import { randomUUID } from 'crypto';

export async function submitAbsence(_: FormState, formData: FormData): Promise<FormState> {
  const type = String(formData.get('type') ?? ''); const start = String(formData.get('start_date') ?? ''); const end = String(formData.get('end_date') ?? ''); const note = String(formData.get('note') ?? '').trim();
  if (!['VACATION', 'SICKNESS'].includes(type) || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < start) return { status: 'error', message: 'Bitte geben Sie einen gültigen Zeitraum an.' };
  const { supabase, membership } = await getCurrentCompany();
  if (!membership || membership.role !== 'EMPLOYEE') return { status: 'error', message: 'Nicht berechtigt.' };
  const { error } = await supabase.rpc('create_my_absence', { p_type: type, p_start: start, p_end: end, p_note: note || null });
  if (error) return { status: 'error', message: 'Die Abwesenheit konnte nicht gespeichert werden.' };
  revalidatePath('/dashboard/urlaub-krankheit'); revalidatePath('/dashboard'); revalidatePath('/dashboard', 'layout'); return { status: 'success', message: type === 'VACATION' ? 'Urlaubsantrag wurde eingereicht.' : 'Krankmeldung wurde erfasst.' };
}

export async function reviewAbsence(id: string, approved: boolean) {
  const { supabase } = await requireStaffCompany();
  const { error } = await supabase.rpc('review_absence', { p_absence_id: id, p_approved: approved });
  if (error) throw new Error('Die Abwesenheit konnte nicht bearbeitet werden.');
  revalidatePath('/dashboard/urlaub-krankheit'); revalidatePath('/dashboard'); revalidatePath('/dashboard', 'layout');
}

export async function uploadAuDocument(absenceId: string, _: FormState, formData: FormData): Promise<FormState> {
  const file = formData.get('document');
  if (!(file instanceof File) || !['application/pdf', 'image/jpeg', 'image/png'].includes(file.type) || file.size > 10 * 1024 * 1024) return { status: 'error', message: 'Bitte wählen Sie ein PDF-, JPG- oder PNG-Dokument bis 10 MB aus.' };
  const { supabase, membership } = await getCurrentCompany();
  if (!membership || membership.role !== 'EMPLOYEE') return { status: 'error', message: 'Nicht berechtigt.' };
  const extension = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg';
  const path = `${membership.company_id}/absence/${absenceId}/${randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage.from('absence-documents').upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) return { status: 'error', message: 'Das AU-Dokument konnte nicht hochgeladen werden.' };
  const { error } = await supabase.rpc('attach_my_au_document', { p_absence_id: absenceId, p_path: path });
  if (error) { await supabase.storage.from('absence-documents').remove([path]); return { status: 'error', message: 'Das AU-Dokument konnte nicht gespeichert werden.' }; }
  revalidatePath('/dashboard/urlaub-krankheit');
  return { status: 'success', message: 'Das AU-Dokument wurde sicher gespeichert.' };
}

export async function reassignAffectedJob(jobId: string, fromMemberId: string, formData: FormData) {
  const toMemberId = String(formData.get('replacement_member_id') ?? '');
  const { supabase } = await requireStaffCompany();
  const { error } = await supabase.rpc('reassign_absence_affected_job', { p_job_id: jobId, p_from_member_id: fromMemberId, p_to_member_id: toMemberId });
  if (error) throw new Error('Die Vertretung konnte nicht zugewiesen werden.');
  revalidatePath('/dashboard/urlaub-krankheit'); revalidatePath('/dashboard/planung'); revalidatePath(`/dashboard/auftraege/${jobId}`); revalidatePath('/dashboard', 'layout');
}
