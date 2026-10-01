'use server';

import { revalidatePath } from 'next/cache';
import { type FormState } from '@/lib/actions';
import { requireStaffCompany } from '@/lib/auth';
import { monthKey } from '@/lib/data/monthly-summary';

/**
 * Freigabe und Wiederöffnen eines Lohnmonats.
 *
 * Die Regeln stehen in der Datenbank -- wer darf, wann ein Monat reif ist,
 * und dass eine Begründung nötig ist. Hier wird nur weitergereicht und die
 * Begründung der Datenbank sichtbar gemacht: "Der Monat 09/2026 ist noch nicht
 * vorbei" hilft, "Aktion fehlgeschlagen" nicht.
 */
function failure(message: string): FormState {
  return { status: 'error', message };
}

function revalidate(month: string) {
  revalidatePath('/dashboard/arbeitszeiten');
  revalidatePath('/dashboard/arbeitszeiten/monatsabschluss');
  revalidatePath(`/dashboard/arbeitszeiten/monatsabschluss?monat=${month}`);
}

export async function releasePayrollPeriod(_: FormState, formData: FormData): Promise<FormState> {
  const month = String(formData.get('monat') ?? '');
  if (!/^\d{4}-\d{2}$/.test(month)) return failure('Der ausgewählte Monat ist ungültig.');

  try {
    const { supabase } = await requireStaffCompany();
    const { error } = await supabase.rpc('release_payroll_period', { p_month: monthKey(month) });
    if (error) return failure(error.message || 'Der Monat konnte nicht freigegeben werden.');
    revalidate(month);
    return {
      status: 'success',
      message: 'Monat freigegeben. Die Zahlen sind eingefroren; der Export liefert ab jetzt immer dieselben.',
    };
  } catch {
    return failure('Der Monat konnte nicht freigegeben werden.');
  }
}

export async function reopenPayrollPeriod(_: FormState, formData: FormData): Promise<FormState> {
  const month = String(formData.get('monat') ?? '');
  const reason = String(formData.get('grund') ?? '').trim();
  if (!/^\d{4}-\d{2}$/.test(month)) return failure('Der ausgewählte Monat ist ungültig.');
  if (reason.length < 3) return failure('Bitte gib an, warum der Monat wieder geöffnet wird.');

  try {
    const { supabase } = await requireStaffCompany();
    const { error } = await supabase.rpc('reopen_payroll_period', {
      p_month: monthKey(month),
      p_reason: reason,
    });
    if (error) return failure(error.message || 'Der Monat konnte nicht wieder geöffnet werden.');
    revalidate(month);
    return {
      status: 'success',
      message: 'Monat wieder geöffnet. Die bisherige Freigabe bleibt erhalten und bleibt exportierbar.',
    };
  } catch {
    return failure('Der Monat konnte nicht wieder geöffnet werden.');
  }
}
