'use server';

import { revalidatePath } from 'next/cache';
import { type FormState } from '@/lib/actions';
import { getCurrentCompany } from '@/lib/auth';
import { normalizeTotpCode } from '@/lib/mfa';

/**
 * Die Faktoren verwaltet Supabase Auth; diese Datei ist nur die Tuer dorthin.
 *
 * Alles hier laeuft bewusst ueber `getCurrentCompany` und nicht ueber
 * `requireStaffCompany`: wer gerade zum Einrichten geschickt wurde, kaeme
 * sonst nicht an das Formular, das ihn aus der Umleitung herausholt.
 */
async function staffContext() {
  const { supabase, membership } = await getCurrentCompany();
  const role = membership?.role ?? null;
  if (role !== 'OWNER' && role !== 'OFFICE') return null;
  const company = membership!.companies as unknown as { id: string; require_staff_mfa?: boolean | null };
  return { supabase, role, company, required: company.require_staff_mfa === true };
}

const FORBIDDEN: FormState = {
  status: 'error',
  message: 'Dieser Bereich steht nur dem Büro zur Verfügung.',
};

/**
 * Eine Einrichtung beginnen und den QR-Code zurueckgeben.
 *
 * Ein abgebrochener Versuch hinterlaesst einen unbestaetigten Faktor, und ein
 * zweiter mit gleichem Namen wird abgewiesen. Darum werden die unbestaetigten
 * vorher aufgeraeumt -- verloren geht dabei nichts, was jemals funktioniert
 * hat.
 */
export async function startMfaEnrolment(): Promise<FormState> {
  const context = await staffContext();
  if (!context) return FORBIDDEN;

  const { data: factors } = await context.supabase.auth.mfa.listFactors();
  for (const factor of factors?.all ?? []) {
    if (factor.status !== 'verified') await context.supabase.auth.mfa.unenroll({ factorId: factor.id });
  }

  const { data, error } = await context.supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `ReinPlan ${new Date().toISOString().slice(0, 10)}`,
  });
  if (error || !data) {
    return { status: 'error', message: error?.message ?? 'Die Einrichtung konnte nicht begonnen werden.' };
  }

  return {
    status: 'success',
    mfaEnrolment: { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret },
  };
}

/** Den ersten Code pruefen. Erst damit gilt der Faktor als bestaetigt. */
export async function confirmMfaEnrolment(_: FormState, formData: FormData): Promise<FormState> {
  const context = await staffContext();
  if (!context) return FORBIDDEN;

  const factorId = String(formData.get('factor_id') ?? '').trim();
  const code = normalizeTotpCode(formData.get('code'));
  if (!factorId) return { status: 'error', message: 'Die Einrichtung ist abgelaufen. Bitte beginne sie neu.' };
  if (!code) return { status: 'error', message: 'Bitte gib den sechsstelligen Code aus der App ein.' };

  const challenge = await context.supabase.auth.mfa.challenge({ factorId });
  if (challenge.error || !challenge.data) {
    return { status: 'error', message: 'Der Code konnte nicht geprüft werden. Bitte beginne die Einrichtung neu.' };
  }
  const { error } = await context.supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.data.id,
    code,
  });
  if (error) return { status: 'error', message: 'Der Code stimmt nicht. Bitte warte auf den nächsten und versuche es erneut.' };

  revalidatePath('/dashboard/sicherheit');
  return { status: 'success', message: 'Zwei-Faktor-Anmeldung ist aktiv.' };
}

/**
 * Den zweiten Faktor fuer die laufende Sitzung bestaetigen.
 *
 * Das ist der Schritt nach der Anmeldung mit Passwort: die Sitzung steht auf
 * aal1, das Konto kann aal2, und der Riegel schickt sie hierher.
 */
export async function verifyMfaChallenge(_: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await getCurrentCompany();
  const code = normalizeTotpCode(formData.get('code'));
  if (!code) return { status: 'error', message: 'Bitte gib den sechsstelligen Code aus der App ein.' };

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = (factors?.totp ?? []).find((entry) => entry.status === 'verified');
  if (!factor) return { status: 'error', message: 'Für dieses Konto ist keine Zwei-Faktor-App eingerichtet.' };

  const challenge = await supabase.auth.mfa.challenge({ factorId: factor.id });
  if (challenge.error || !challenge.data) {
    return { status: 'error', message: 'Die Prüfung konnte nicht gestartet werden. Bitte versuche es erneut.' };
  }
  const { error } = await supabase.auth.mfa.verify({
    factorId: factor.id,
    challengeId: challenge.data.id,
    code,
  });
  if (error) return { status: 'error', message: 'Der Code stimmt nicht. Bitte warte auf den nächsten und versuche es erneut.' };

  revalidatePath('/dashboard', 'layout');
  return { status: 'success', message: 'Bestätigt.', redirectTo: '/dashboard' };
}

/**
 * Einen Faktor entfernen.
 *
 * Solange der Betrieb Zwei-Faktor verlangt, bleibt der letzte stehen: ihn zu
 * entfernen wuerde die Person beim naechsten Klick in die Einrichtung
 * zurueckwerfen, ohne dass sie das erwartet.
 */
export async function removeMfaFactor(_: FormState, formData: FormData): Promise<FormState> {
  const context = await staffContext();
  if (!context) return FORBIDDEN;

  const factorId = String(formData.get('factor_id') ?? '').trim();
  if (!factorId) return { status: 'error', message: 'Es wurde kein Faktor ausgewählt.' };

  const { data: factors } = await context.supabase.auth.mfa.listFactors();
  const verified = (factors?.all ?? []).filter((entry) => entry.status === 'verified');
  if (context.required && verified.length <= 1 && verified.some((entry) => entry.id === factorId)) {
    return {
      status: 'error',
      message: 'Solange Zwei-Faktor für das Büro verpflichtend ist, kann der letzte Faktor nicht entfernt werden.',
    };
  }

  const { error } = await context.supabase.auth.mfa.unenroll({ factorId });
  if (error) return { status: 'error', message: 'Der Faktor konnte nicht entfernt werden.' };

  revalidatePath('/dashboard/sicherheit');
  return { status: 'success', message: 'Der Faktor wurde entfernt.' };
}

/**
 * Den Zwang fuer alle Buero-Konten setzen. Die Datenbank laesst nur die
 * Inhaberin daran; hier wird zusaetzlich verlangt, dass sie selbst schon einen
 * Faktor hat -- sonst schaltet sie sich als erste in die Einrichtung.
 */
export async function setStaffMfaRequirement(_: FormState, formData: FormData): Promise<FormState> {
  const context = await staffContext();
  if (!context) return FORBIDDEN;

  const required = formData.get('required') === 'on' || formData.get('required') === 'true';
  if (required) {
    const { data: factors } = await context.supabase.auth.mfa.listFactors();
    const hasOwn = (factors?.all ?? []).some((entry) => entry.status === 'verified');
    if (!hasOwn) {
      return { status: 'error', message: 'Richte zuerst deinen eigenen zweiten Faktor ein.' };
    }
  }

  const { error } = await context.supabase.rpc('set_require_staff_mfa', { p_required: required });
  if (error) return { status: 'error', message: error.message };

  revalidatePath('/dashboard/sicherheit');
  return {
    status: 'success',
    message: required
      ? 'Zwei-Faktor ist jetzt für alle Büro-Konten verpflichtend.'
      : 'Zwei-Faktor ist jetzt freiwillig.',
  };
}
