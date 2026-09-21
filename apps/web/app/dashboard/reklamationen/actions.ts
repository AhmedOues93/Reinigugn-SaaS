'use server';

import { revalidatePath } from 'next/cache';
import { randomUUID } from 'crypto';
import { complaintSchema, qualityInspectionSchema } from '@reinigung/validation';
import { type FormState } from '@/lib/actions';
import { requireStaffCompany } from '@/lib/auth';
import { jobPhotoExtension, validateJobPhotoFile } from '@/lib/photo-validation';

const failure = (message: string): FormState => ({ status: 'error', message });
const clean = <T extends Record<string, unknown>>(value: T) => Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, entry === undefined ? null : entry])) as T;

function revalidateOperations(objectId?: string) {
  revalidatePath('/dashboard'); revalidatePath('/dashboard/reklamationen'); revalidatePath('/dashboard/qualitaetskontrolle');
  if (objectId) revalidatePath(`/dashboard/objekte/${objectId}`);
}

export async function createComplaint(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = complaintSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? 'Bitte prüfe deine Eingaben.');
  try {
    const { supabase, company, membership } = await requireStaffCompany();
    const { data, error } = await supabase.from('complaints').insert({ ...clean(parsed.data), company_id: company.id, created_by: membership!.id }).select('id').single();
    if (error || !data) return failure('Die Reklamation konnte nicht erstellt werden.');
    revalidateOperations(parsed.data.cleaning_object_id);
    return { status: 'success', id: data.id };
  } catch { return failure('Die Reklamation konnte nicht erstellt werden.'); }
}

export async function updateComplaint(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const parsed = complaintSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? 'Bitte prüfe deine Eingaben.');
  try {
    const { supabase, company, membership } = await requireStaffCompany();
    const { data: previous, error: readError } = await supabase
      .from('complaints')
      .select('status')
      .eq('company_id', company.id)
      .eq('id', id)
      .maybeSingle();
    if (readError || !previous) return failure('Die Reklamation konnte nicht geladen werden.');

    const { error } = await supabase.from('complaints').update(clean(parsed.data)).eq('company_id', company.id).eq('id', id);
    if (error) return failure('Die Reklamation konnte nicht aktualisiert werden.');

    if (previous.status !== parsed.data.status && membership) {
      const labels: Record<string, string> = {
        OPEN: 'Offen',
        IN_PROGRESS: 'In Bearbeitung',
        RESOLVED: 'Gelöst',
        CLOSED: 'Geschlossen',
      };
      await supabase.from('complaint_updates').insert({
        company_id: company.id,
        complaint_id: id,
        author_member_id: membership.id,
        status: parsed.data.status,
        note: `Status geändert: ${labels[previous.status] ?? previous.status} → ${labels[parsed.data.status] ?? parsed.data.status}`,
      });
    }

    revalidateOperations(parsed.data.cleaning_object_id); revalidatePath(`/dashboard/reklamationen/${id}`);
    return { status: 'success', id };
  } catch { return failure('Die Reklamation konnte nicht aktualisiert werden.'); }
}

export async function createFollowUpJob(complaintId: string, _: FormState, formData: FormData): Promise<FormState> {
  const date = String(formData.get('scheduled_date') ?? ''); const start = String(formData.get('planned_start_time') ?? ''); const end = String(formData.get('planned_end_time') ?? '');
  const memberIds = formData.getAll('member_ids').filter((value): value is string => typeof value === 'string' && value.length > 0);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d\d:\d\d$/.test(start) || !/^\d\d:\d\d$/.test(end) || end <= start) return failure('Bitte gib einen gültigen Zeitraum für die Nacharbeit an.');
  try {
    const { supabase } = await requireStaffCompany();
    const { data, error } = await supabase.rpc('create_complaint_follow_up_job', { p_complaint_id: complaintId, p_scheduled_date: date, p_start_time: start, p_end_time: end, p_member_ids: memberIds });
    if (error || !data) return failure('Der Nacharbeitsauftrag konnte nicht erstellt werden.');
    revalidateOperations(); revalidatePath(`/dashboard/reklamationen/${complaintId}`); revalidatePath('/dashboard/auftraege');
    return { status: 'success', id: data as string };
  } catch { return failure('Der Nacharbeitsauftrag konnte nicht erstellt werden.'); }
}

export async function createQualityInspection(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = qualityInspectionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? 'Bitte prüfe deine Eingaben.');
  try {
    const { supabase, company, membership } = await requireStaffCompany();
    const criteria = (parsed.data.criteria ?? '').split('\n').map((item) => item.trim()).filter(Boolean);
    const { data, error } = await supabase.from('quality_inspections').insert({ ...clean({ ...parsed.data, criteria, job_id: parsed.data.job_id }), company_id: company.id, inspector_member_id: membership!.id }).select('id').single();
    if (error || !data) return failure('Die Qualitätskontrolle konnte nicht gespeichert werden.');
    revalidateOperations(parsed.data.cleaning_object_id);
    return { status: 'success', id: data.id };
  } catch { return failure('Die Qualitätskontrolle konnte nicht gespeichert werden.'); }
}

export async function uploadOperationalPhoto(scope: 'COMPLAINT' | 'QUALITY_INSPECTION', recordId: string, _: FormState, formData: FormData): Promise<FormState> {
  try {
    const { supabase, company } = await requireStaffCompany();
    const file = formData.get('photo'); const category = String(formData.get('category') ?? ''); const description = String(formData.get('description') ?? '').trim();
    if (!(file instanceof File)) return failure('Bitte wähle ein Foto aus.');
    const fileError = validateJobPhotoFile(file); if (fileError) return failure(fileError);
    if (!['BEFORE', 'AFTER', 'DOCUMENTATION'].includes(category)) return failure('Bitte wähle eine gültige Kategorie.');
    if (description.length > 500) return failure('Die Notiz darf maximal 500 Zeichen lang sein.');
    const segment = scope === 'COMPLAINT' ? 'complaint' : 'quality'; const path = `${company.id}/${segment}/${recordId}/${randomUUID()}.${jobPhotoExtension(file.type)}`;
    const { error: uploadError } = await supabase.storage.from('job-photos').upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) return failure('Das Foto konnte nicht hochgeladen werden.');
    const { error: metadataError } = await supabase.rpc('create_operational_photo_metadata', { p_scope: scope, p_record_id: recordId, p_storage_path: path, p_category: category, p_description: description || null });
    if (metadataError) { await supabase.storage.from('job-photos').remove([path]); return failure('Das Foto konnte nicht gespeichert werden.'); }
    revalidatePath('/dashboard/reklamationen'); revalidatePath('/dashboard/qualitaetskontrolle'); revalidatePath(`/dashboard/reklamationen/${recordId}`);
    return { status: 'success', message: 'Foto wurde dokumentiert.' };
  } catch { return failure('Das Foto konnte nicht hochgeladen werden.'); }
}

export async function deleteOperationalPhoto(photoId: string, _: FormState, __: FormData): Promise<FormState> {
  try {
    const { supabase } = await requireStaffCompany(); const { data: path, error } = await supabase.rpc('delete_operational_photo', { p_photo_id: photoId });
    if (error || !path) return failure('Das Foto konnte nicht entfernt werden.');
    const { error: storageError } = await supabase.storage.from('job-photos').remove([path]); if (storageError) return failure('Das Foto konnte nicht entfernt werden.');
    revalidatePath('/dashboard/reklamationen'); revalidatePath('/dashboard/qualitaetskontrolle'); return { status: 'success', message: 'Foto wurde entfernt.' };
  } catch { return failure('Das Foto konnte nicht entfernt werden.'); }
}
