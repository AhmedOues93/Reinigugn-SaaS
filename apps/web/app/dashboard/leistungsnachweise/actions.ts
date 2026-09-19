'use server';

import { revalidatePath } from 'next/cache';
import { type FormState } from '@/lib/actions';
import { requireStaffCompany } from '@/lib/auth';

function revalidateQueue(jobId: string) {
  revalidatePath('/dashboard/leistungsnachweise');
  revalidatePath(`/dashboard/auftraege/${jobId}/leistungsnachweis`);
  revalidatePath('/dashboard/reklamationen');
  revalidatePath('/portal/leistungen');
}

/**
 * Closing out a problem the customer reported. Two honest outcomes, and the
 * database records which one was used:
 *
 *   ZURUECK_ZUR_ABNAHME  the office fixed something and asks the customer again
 *   BUERO_FREIGABE       settled directly — a phone call, a credit note — and
 *                        released for billing
 *
 * The second is never recorded as the customer having confirmed, because they
 * did not. It gets its own acceptance method precisely so a later reader
 * cannot mistake one for the other.
 */
export async function resolveServiceDispute(
  jobId: string,
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const outcome = String(formData.get('outcome') ?? '');
  const note = String(formData.get('note') ?? '').trim();
  if (outcome !== 'ZURUECK_ZUR_ABNAHME' && outcome !== 'BUERO_FREIGABE') {
    return { status: 'error', message: 'Bitte wähle aus, wie die Meldung geklärt wurde.' };
  }
  if (note.length > 1000) return { status: 'error', message: 'Die Notiz ist zu lang.' };

  try {
    const { supabase } = await requireStaffCompany();
    const { error } = await supabase.rpc('resolve_service_dispute', {
      p_job_id: jobId,
      p_outcome: outcome,
      p_note: note || null,
    });
    if (error) return { status: 'error', message: 'Die Meldung konnte nicht geklärt werden.' };
    revalidateQueue(jobId);
    return {
      status: 'success',
      message:
        outcome === 'BUERO_FREIGABE'
          ? 'Die Leistung wurde vom Büro freigegeben und ist abrechenbar.'
          : 'Die Leistung liegt wieder beim Kunden zur Abnahme.',
    };
  } catch {
    return { status: 'error', message: 'Die Meldung konnte nicht geklärt werden.' };
  }
}

/**
 * Undoing an acceptance. Owner only, reason required, and both the acceptance
 * being undone and the reason for undoing it stay in the audit trail — the
 * point is that nobody can quietly make it look as though the customer
 * approved something else.
 */
export async function revokeServiceAcceptance(
  jobId: string,
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const reason = String(formData.get('reason') ?? '').trim();
  if (reason.length < 3) return { status: 'error', message: 'Bitte gib einen Grund für den Widerruf an.' };

  try {
    const { supabase } = await requireStaffCompany();
    const { error } = await supabase.rpc('revoke_service_acceptance', {
      p_job_id: jobId,
      p_reason: reason,
    });
    if (error) {
      if (error.message.includes('already invoiced')) {
        return {
          status: 'error',
          message: 'Diese Leistung ist bereits abgerechnet. Bitte zuerst die Rechnung stornieren oder korrigieren.',
        };
      }
      if (error.message.includes('Only the OWNER')) {
        return { status: 'error', message: 'Nur die Inhaberin oder der Inhaber kann eine Abnahme widerrufen.' };
      }
      return { status: 'error', message: 'Die Abnahme konnte nicht widerrufen werden.' };
    }
    revalidateQueue(jobId);
    return { status: 'success', message: 'Die Abnahme wurde widerrufen und protokolliert.' };
  } catch {
    return { status: 'error', message: 'Die Abnahme konnte nicht widerrufen werden.' };
  }
}
