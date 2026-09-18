'use server';

import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { type FormState } from '@/lib/actions';
import { getCurrentCompany } from '@/lib/auth';
import { employeeLocale } from '@/lib/data/employee';
import { isLocale, localeCookie, t } from '@/lib/i18n';
import { cookies } from 'next/headers';
import { jobPhotoExtension, validateJobPhotoFile } from '@/lib/photo-validation';

/**
 * Every employee action resolves the membership from the session and refuses any
 * other role. `company_id` and `role` are never read from the submitted form.
 */
async function employeeContext() {
  const { supabase, membership, profile } = await getCurrentCompany();
  if (!membership || membership.role !== 'EMPLOYEE') return null;
  return { supabase, membership, profile };
}

function revalidateEmployee(jobId?: string) {
  revalidatePath('/mitarbeiter');
  revalidatePath('/mitarbeiter/einsaetze');
  if (jobId) revalidatePath(`/mitarbeiter/einsaetze/${jobId}`);
}

async function denied(): Promise<FormState> {
  return { status: 'error', message: t(await employeeLocaleSafe(), 'common.notAllowed') };
}

async function employeeLocaleSafe() {
  try {
    return await employeeLocale();
  } catch {
    return 'de' as const;
  }
}

async function runTimeAction(jobId: string, operation: 'start_my_job' | 'stop_my_job'): Promise<FormState> {
  const context = await employeeContext();
  if (!context) return denied();
  const locale = await employeeLocaleSafe();
  const { error } = await context.supabase.rpc(operation, { p_job_id: jobId });
  if (error) return { status: 'error', message: t(locale, 'common.errorBody') };
  revalidateEmployee(jobId);
  revalidatePath('/dashboard');
  revalidatePath('/dashboard/arbeitszeiten');
  return { status: 'success', message: t(locale, operation === 'start_my_job' ? 'emp.job.started' : 'emp.job.stopped') };
}

export async function startMyJob(jobId: string, _: FormState, __: FormData) {
  return runTimeAction(jobId, 'start_my_job');
}

export async function stopMyJob(jobId: string, _: FormState, __: FormData) {
  return runTimeAction(jobId, 'stop_my_job');
}

export async function completeMyChecklistItem(itemId: string, completed: boolean, _: FormState, __: FormData): Promise<FormState> {
  const context = await employeeContext();
  if (!context) return denied();
  const locale = await employeeLocaleSafe();
  const { error } = await context.supabase.rpc('complete_my_checklist_item', { p_item_id: itemId, p_completed: completed });
  if (error) return { status: 'error', message: t(locale, 'common.errorBody') };
  revalidateEmployee();
  return { status: 'success', message: t(locale, 'common.save') };
}

export async function uploadMyJobPhoto(jobId: string, _: FormState, formData: FormData): Promise<FormState> {
  const context = await employeeContext();
  if (!context) return denied();
  const locale = await employeeLocaleSafe();
  const file = formData.get('photo');
  if (!(file instanceof File)) return { status: 'error', message: t(locale, 'emp.photo.file') };
  const fileError = validateJobPhotoFile(file);
  if (fileError) return { status: 'error', message: fileError };
  const category = String(formData.get('category') ?? '');
  if (!['BEFORE', 'AFTER', 'DOCUMENTATION'].includes(category)) return { status: 'error', message: t(locale, 'emp.photo.category') };
  const checklistItemId = String(formData.get('checklist_item_id') ?? '').trim() || null;
  const description = String(formData.get('description') ?? '').trim();
  if (description.length > 500) return { status: 'error', message: t(locale, 'common.errorBody') };

  // The tenant segment comes from the server-resolved membership, never the form.
  const path = `${context.membership.company_id}/${jobId}/${randomUUID()}.${jobPhotoExtension(file.type)}`;
  const { error: uploadError } = await context.supabase.storage
    .from('job-photos')
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) return { status: 'error', message: t(locale, 'common.errorBody') };
  const { error: metadataError } = await context.supabase.rpc('create_my_job_photo_metadata', {
    p_job_id: jobId,
    p_storage_path: path,
    p_category: category,
    p_checklist_item_id: checklistItemId,
    p_description: description || null,
  });
  if (metadataError) {
    await context.supabase.storage.from('job-photos').remove([path]);
    return { status: 'error', message: t(locale, 'common.errorBody') };
  }
  revalidateEmployee(jobId);
  revalidatePath(`/dashboard/auftraege/${jobId}`);
  return { status: 'success', message: t(locale, 'emp.photo.upload') };
}

export async function deleteMyJobPhoto(photoId: string, _: FormState, __: FormData): Promise<FormState> {
  const context = await employeeContext();
  if (!context) return denied();
  const locale = await employeeLocaleSafe();
  const { data: path, error } = await context.supabase.rpc('delete_job_photo', { p_photo_id: photoId });
  if (error || !path) return { status: 'error', message: t(locale, 'common.errorBody') };
  const { error: storageError } = await context.supabase.storage.from('job-photos').remove([path]);
  if (storageError) return { status: 'error', message: t(locale, 'common.errorBody') };
  revalidateEmployee();
  revalidatePath('/dashboard/auftraege');
  return { status: 'success', message: t(locale, 'common.save') };
}

export async function submitMyAbsence(_: FormState, formData: FormData): Promise<FormState> {
  const context = await employeeContext();
  if (!context) return denied();
  const locale = await employeeLocaleSafe();
  const type = String(formData.get('type') ?? '');
  const startDate = String(formData.get('start_date') ?? '');
  const endDate = String(formData.get('end_date') ?? '');
  const note = String(formData.get('note') ?? '').trim();
  if (!['VACATION', 'SICKNESS'].includes(type) || !startDate || !endDate) {
    return { status: 'error', message: t(locale, 'common.errorBody') };
  }
  if (endDate < startDate) return { status: 'error', message: t(locale, 'common.errorBody') };
  const { error } = await context.supabase.rpc('create_my_absence', {
    p_type: type,
    p_start: startDate,
    p_end: endDate,
    p_note: note || null,
  });
  if (error) return { status: 'error', message: t(locale, 'common.errorBody') };
  revalidatePath('/mitarbeiter/abwesenheit');
  revalidatePath('/dashboard/urlaub-krankheit');
  return { status: 'success', message: t(locale, 'emp.absence.submit') };
}

export async function uploadMyAuDocument(absenceId: string, _: FormState, formData: FormData): Promise<FormState> {
  const context = await employeeContext();
  if (!context) return denied();
  const locale = await employeeLocaleSafe();
  const file = formData.get('document');
  if (!(file instanceof File) || !['application/pdf', 'image/jpeg', 'image/png'].includes(file.type) || file.size > 10 * 1024 * 1024) {
    return { status: 'error', message: t(locale, 'emp.absence.auHint') };
  }
  const extension = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg';
  // Tenant segment from the session membership, absence id from the row the
  // employee owns; the storage policy re-checks both.
  const path = `${context.membership.company_id}/absence/${absenceId}/${randomUUID()}.${extension}`;
  const { error: uploadError } = await context.supabase.storage
    .from('absence-documents')
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) return { status: 'error', message: t(locale, 'common.errorBody') };
  const { error } = await context.supabase.rpc('attach_my_au_document', { p_absence_id: absenceId, p_path: path });
  if (error) {
    await context.supabase.storage.from('absence-documents').remove([path]);
    return { status: 'error', message: t(locale, 'common.errorBody') };
  }
  revalidatePath('/mitarbeiter/abwesenheit');
  revalidatePath('/dashboard/urlaub-krankheit');
  return { status: 'success', message: t(locale, 'emp.absence.auUploaded') };
}

export async function markMyNotificationRead(notificationId: string): Promise<void> {
  const context = await employeeContext();
  if (!context) return;
  await context.supabase
    .from('in_app_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('recipient_member_id', context.membership.id);
  revalidatePath('/mitarbeiter/nachrichten');
  revalidatePath('/mitarbeiter');
}

/** Employees pick their own app language; nothing else on their record is writable. */
export async function setMyAppLanguage(value: string): Promise<FormState> {
  const context = await employeeContext();
  if (!context) return denied();
  if (!isLocale(value)) return { status: 'error', message: t('de', 'common.errorBody') };
  const { error } = await context.supabase.rpc('set_my_preferred_language', { p_locale: value });
  if (error) return { status: 'error', message: t(value, 'common.errorBody') };
  (await cookies()).set(localeCookie, value, { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 });
  revalidatePath('/mitarbeiter', 'layout');
  return { status: 'success', message: t(value, 'common.save') };
}

// ---------------------------------------------------------------------------
// Profile: avatar and contact details
// ---------------------------------------------------------------------------

const avatarTypes: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const avatarMaxBytes = 2 * 1024 * 1024;

/**
 * The employee replaces their own avatar. The object path is built from the
 * profile id resolved server-side from the session, and `set_my_avatar` checks
 * that same ownership again in the database — so a crafted path cannot touch a
 * colleague's image even if this code were bypassed.
 */
export async function uploadMyAvatar(_: FormState, formData: FormData): Promise<FormState> {
  const context = await employeeContext();
  if (!context) return denied();
  const locale = await employeeLocaleSafe();
  const file = formData.get('avatar');
  if (!(file instanceof File) || file.size === 0) return { status: 'error', message: t(locale, 'emp.profile.avatarHint') };
  const extension = avatarTypes[file.type];
  if (!extension || file.size > avatarMaxBytes) return { status: 'error', message: t(locale, 'emp.profile.avatarHint') };

  const profile = context.profile;
  if (!profile) return denied();
  const path = `${profile.id}/${randomUUID()}.${extension}`;
  const { error: uploadError } = await context.supabase.storage
    .from('avatars')
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) return { status: 'error', message: t(locale, 'common.errorBody') };
  const { error } = await context.supabase.rpc('set_my_avatar', { p_storage_path: path });
  if (error) {
    await context.supabase.storage.from('avatars').remove([path]);
    return { status: 'error', message: t(locale, 'common.errorBody') };
  }
  revalidatePath('/mitarbeiter', 'layout');
  return { status: 'success', message: t(locale, 'emp.profile.avatarSaved') };
}

export async function removeMyAvatar(_: FormState, __: FormData): Promise<FormState> {
  const context = await employeeContext();
  if (!context) return denied();
  const locale = await employeeLocaleSafe();
  const { error } = await context.supabase.rpc('set_my_avatar', { p_storage_path: null });
  if (error) return { status: 'error', message: t(locale, 'common.errorBody') };
  revalidatePath('/mitarbeiter', 'layout');
  return { status: 'success', message: t(locale, 'emp.profile.avatarSaved') };
}

/**
 * Name and phone only. The email address is the Supabase Auth identity and is
 * deliberately not writable here: changing it belongs to the Auth email-change
 * flow, and writing it to the profile row alone would leave the two disagreeing.
 */
export async function updateMyContactDetails(_: FormState, formData: FormData): Promise<FormState> {
  const context = await employeeContext();
  if (!context) return denied();
  const locale = await employeeLocaleSafe();
  const firstName = String(formData.get('first_name') ?? '').trim();
  const lastName = String(formData.get('last_name') ?? '').trim();
  const phone = String(formData.get('phone') ?? '').trim();
  if (!firstName || !lastName || firstName.length > 120 || lastName.length > 120 || phone.length > 64) {
    return { status: 'error', message: t(locale, 'common.errorBody') };
  }
  const { error } = await context.supabase.rpc('update_my_contact_details', {
    p_first_name: firstName,
    p_last_name: lastName,
    p_phone: phone || null,
  });
  if (error) return { status: 'error', message: t(locale, 'common.errorBody') };
  revalidatePath('/mitarbeiter', 'layout');
  revalidatePath('/dashboard/mitarbeiter');
  return { status: 'success', message: t(locale, 'emp.profile.saved') };
}

// ---------------------------------------------------------------------------
// Messaging (online only)
// ---------------------------------------------------------------------------

/**
 * Messages are never queued offline: a cleaner must not walk away believing the
 * office was told something that is still sitting on their phone. The client
 * blocks the form while offline and this action simply fails if the request
 * cannot reach the server.
 */
export async function startMyThread(_: FormState, formData: FormData): Promise<FormState> {
  const context = await employeeContext();
  if (!context) return denied();
  const locale = await employeeLocaleSafe();
  const subject = String(formData.get('subject') ?? '').trim();
  const body = String(formData.get('body') ?? '').trim();
  if (!subject || subject.length > 200 || !body || body.length > 4000) {
    return { status: 'error', message: t(locale, 'common.errorBody') };
  }
  const { data, error } = await context.supabase.rpc('start_message_thread', {
    p_employee_member_id: context.membership.id,
    p_subject: subject,
    p_body: body,
  });
  if (error || !data) return { status: 'error', message: t(locale, 'common.errorBody') };
  revalidatePath('/mitarbeiter/nachrichten');
  revalidatePath('/dashboard/nachrichten');
  redirect(`/mitarbeiter/nachrichten/${data as string}`);
}

export async function sendMyMessage(threadId: string, _: FormState, formData: FormData): Promise<FormState> {
  const context = await employeeContext();
  if (!context) return denied();
  const locale = await employeeLocaleSafe();
  const body = String(formData.get('body') ?? '').trim();
  if (!body || body.length > 4000) return { status: 'error', message: t(locale, 'common.errorBody') };
  const { error } = await context.supabase.rpc('send_message', { p_thread_id: threadId, p_body: body });
  if (error) return { status: 'error', message: t(locale, 'common.errorBody') };
  revalidatePath('/mitarbeiter/nachrichten');
  revalidatePath(`/mitarbeiter/nachrichten/${threadId}`);
  revalidatePath('/dashboard/nachrichten');
  return { status: 'success', message: t(locale, 'emp.messages.sent') };
}

