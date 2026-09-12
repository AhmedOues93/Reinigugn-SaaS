'use server';

import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { type FormState } from '@/lib/actions';
import { getCurrentCompany } from '@/lib/auth';
import { jobPhotoExtension, validateJobPhotoFile } from '@/lib/photo-validation';

async function run(jobId: string, operation: 'start_my_job' | 'stop_my_job'): Promise<FormState> {
  const { supabase, membership } = await getCurrentCompany();
  if (!membership || membership.role !== 'EMPLOYEE') return { status: 'error', message: 'Nicht berechtigt.' };
  const { error } = await supabase.rpc(operation, { p_job_id: jobId });
  if (error) return { status: 'error', message: operation === 'start_my_job' ? 'Der Einsatz konnte nicht gestartet werden.' : 'Der Einsatz konnte nicht beendet werden.' };
  revalidatePath('/dashboard'); revalidatePath('/dashboard/mein-bereich'); revalidatePath(`/dashboard/mein-bereich/${jobId}`); revalidatePath('/dashboard/arbeitszeiten');
  return { status: 'success', message: operation === 'start_my_job' ? 'Einsatz gestartet.' : 'Einsatz beendet.' };
}

export async function startMyJob(jobId: string, _: FormState, __: FormData) { return run(jobId, 'start_my_job'); }
export async function stopMyJob(jobId: string, _: FormState, __: FormData) { return run(jobId, 'stop_my_job'); }

export async function completeMyChecklistItem(itemId: string, completed: boolean, _: FormState, __: FormData): Promise<FormState> {
  const { supabase, membership } = await getCurrentCompany();
  if (!membership || membership.role !== 'EMPLOYEE') return { status: 'error', message: 'Nicht berechtigt.' };
  const { error } = await supabase.rpc('complete_my_checklist_item', { p_item_id: itemId, p_completed: completed });
  if (error) return { status: 'error', message: 'Der Checklistenpunkt konnte nicht aktualisiert werden.' };
  revalidatePath('/dashboard'); revalidatePath('/dashboard/mein-bereich');
  return { status: 'success', message: completed ? 'Punkt erledigt.' : 'Punkt wieder geoeffnet.' };
}

export async function uploadMyJobPhoto(jobId: string, _: FormState, formData: FormData): Promise<FormState> {
  const { supabase, membership } = await getCurrentCompany();
  if (!membership || membership.role !== 'EMPLOYEE') return { status: 'error', message: 'Nicht berechtigt.' };
  const file = formData.get('photo');
  if (!(file instanceof File)) return { status: 'error', message: 'Bitte waehle ein Foto aus.' };
  const fileError = validateJobPhotoFile(file);
  if (fileError) return { status: 'error', message: fileError };
  const category = String(formData.get('category') ?? '');
  if (!['BEFORE', 'AFTER', 'DOCUMENTATION'].includes(category)) return { status: 'error', message: 'Bitte waehle eine gueltige Kategorie.' };
  const checklistItemId = String(formData.get('checklist_item_id') ?? '').trim() || null;
  const description = String(formData.get('description') ?? '').trim();
  if (description.length > 500) return { status: 'error', message: 'Die Notiz darf maximal 500 Zeichen lang sein.' };
  const path = `${membership.company_id}/${jobId}/${randomUUID()}.${jobPhotoExtension(file.type)}`;
  const { error: uploadError } = await supabase.storage.from('job-photos').upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) return { status: 'error', message: 'Das Foto konnte nicht hochgeladen werden.' };
  const { error: metadataError } = await supabase.rpc('create_my_job_photo_metadata', { p_job_id: jobId, p_storage_path: path, p_category: category, p_checklist_item_id: checklistItemId, p_description: description || null });
  if (metadataError) { await supabase.storage.from('job-photos').remove([path]); return { status: 'error', message: 'Das Foto konnte nicht gespeichert werden.' }; }
  revalidatePath('/dashboard/mein-bereich'); revalidatePath(`/dashboard/mein-bereich/${jobId}`); revalidatePath(`/dashboard/auftraege/${jobId}`);
  return { status: 'success', message: 'Foto wurde dokumentiert.' };
}

export async function deleteMyJobPhoto(photoId: string, _: FormState, __: FormData): Promise<FormState> {
  const { supabase, membership } = await getCurrentCompany();
  if (!membership || membership.role !== 'EMPLOYEE') return { status: 'error', message: 'Nicht berechtigt.' };
  const { data: path, error } = await supabase.rpc('delete_job_photo', { p_photo_id: photoId });
  if (error || !path) return { status: 'error', message: 'Das Foto konnte nicht entfernt werden.' };
  const { error: storageError } = await supabase.storage.from('job-photos').remove([path]);
  if (storageError) return { status: 'error', message: 'Das Foto konnte nicht entfernt werden.' };
  revalidatePath('/dashboard/mein-bereich'); revalidatePath('/dashboard/auftraege');
  return { status: 'success', message: 'Foto wurde entfernt.' };
}

export async function addMyComplaintUpdate(complaintId: string, _: FormState, formData: FormData): Promise<FormState> {
  const status = String(formData.get('status') ?? ''); const note = String(formData.get('note') ?? '').trim();
  if (!['IN_PROGRESS', 'RESOLVED'].includes(status) || !note) return { status: 'error', message: 'Bitte Status und eine kurze operative Notiz angeben.' };
  const { supabase, membership } = await getCurrentCompany();
  if (!membership || membership.role !== 'EMPLOYEE') return { status: 'error', message: 'Nicht berechtigt.' };
  const { error } = await supabase.rpc('add_my_complaint_update', { p_complaint_id: complaintId, p_status: status, p_note: note });
  if (error) return { status: 'error', message: 'Die Reklamationsaktualisierung konnte nicht gespeichert werden.' };
  revalidatePath('/dashboard/mein-bereich'); revalidatePath('/dashboard/reklamationen'); revalidatePath(`/dashboard/reklamationen/${complaintId}`);
  return { status: 'success', message: 'Aktualisierung wurde gespeichert.' };
}
