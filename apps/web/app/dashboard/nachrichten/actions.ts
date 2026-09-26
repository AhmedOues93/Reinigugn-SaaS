'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getCurrentCompany } from '@/lib/auth';
import { type FormState } from '@/lib/actions';
export async function openComplaintNotification(id: string, complaintId: string) {
  const { supabase, membership } = await getCurrentCompany();
  if (!membership || !['OWNER', 'OFFICE'].includes(membership.role)) throw new Error('Nicht berechtigt.');
  const { error } = await supabase
    .from('in_app_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .eq('recipient_member_id', membership.id)
    .eq('complaint_id', complaintId);
  if (error) throw new Error('Benachrichtigung konnte nicht geöffnet werden.');
  revalidatePath('/dashboard/nachrichten');
  revalidatePath('/dashboard/reklamationen');
  revalidatePath('/dashboard', 'layout');
  redirect(`/dashboard/reklamationen/${complaintId}`);
}

export async function markNotificationRead(id: string) { const { supabase, membership } = await getCurrentCompany(); if (!membership) throw new Error('Nicht berechtigt.'); const { error } = await supabase.from('in_app_notifications').update({ read_at: new Date().toISOString() }).eq('id', id).eq('recipient_member_id', membership.id); if (error) throw new Error('Benachrichtigung konnte nicht aktualisiert werden.'); revalidatePath('/dashboard/nachrichten'); revalidatePath('/dashboard', 'layout'); }

/**
 * The office replies in the same thread. `send_message` re-checks in the
 * database that the caller is staff of the thread's own company and notifies the
 * employee through the existing notification table.
 */
export async function replyToThread(threadId: string, _: FormState, formData: FormData): Promise<FormState> {
  const { supabase, membership } = await getCurrentCompany();
  if (!membership || !['OWNER', 'OFFICE'].includes(membership.role)) {
    return { status: 'error', message: 'Nicht berechtigt.' };
  }
  const body = String(formData.get('body') ?? '').trim();
  if (!body || body.length > 4000) return { status: 'error', message: 'Bitte geben Sie eine Nachricht ein.' };
  const { error } = await supabase.rpc('send_message', { p_thread_id: threadId, p_body: body });
  if (error) return { status: 'error', message: 'Die Nachricht konnte nicht gesendet werden.' };
  revalidatePath('/dashboard/nachrichten');
  revalidatePath(`/dashboard/nachrichten/${threadId}`);
  revalidatePath('/mitarbeiter/nachrichten');
  return { status: 'success', message: 'Nachricht gesendet.' };
}

/** Opens a thread with one employee of the caller's own company. */
export async function startThreadWithEmployee(memberId: string, _: FormState, formData: FormData): Promise<FormState> {
  const { supabase, membership } = await getCurrentCompany();
  if (!membership || !['OWNER', 'OFFICE'].includes(membership.role)) {
    return { status: 'error', message: 'Nicht berechtigt.' };
  }
  const subject = String(formData.get('subject') ?? '').trim();
  const body = String(formData.get('body') ?? '').trim();
  if (!subject || subject.length > 200 || !body || body.length > 4000) {
    return { status: 'error', message: 'Bitte geben Sie Betreff und Nachricht ein.' };
  }
  const { data, error } = await supabase.rpc('start_message_thread', {
    p_employee_member_id: memberId,
    p_subject: subject,
    p_body: body,
  });
  if (error || !data) return { status: 'error', message: 'Die Unterhaltung konnte nicht gestartet werden.' };
  revalidatePath('/dashboard/nachrichten');
  revalidatePath('/mitarbeiter/nachrichten');
  redirect(`/dashboard/nachrichten/${data as string}`);
}
