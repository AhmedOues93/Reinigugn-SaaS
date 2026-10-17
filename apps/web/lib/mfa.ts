/**
 * Zwei-Faktor fuer die Buero-Konten.
 *
 * Die Faktoren selbst verwaltet Supabase Auth. Was hier steht, ist nur die
 * Entscheidung, die vor jeder Buero-Seite fallen muss: durchlassen, zum
 * Bestaetigen schicken oder zum Einrichten.
 *
 * Beide Angaben kommen aus dem Token und kosten keine Abfrage:
 * `currentLevel` ist das Niveau der laufenden Sitzung, `nextLevel` das
 * hoechste, das dieses Konto erreichen kann. `nextLevel === 'aal2'` heisst
 * also schon: es gibt einen bestaetigten Faktor. Deshalb braucht der Riegel
 * keine Liste der Faktoren abzurufen.
 */

export type AssuranceLevel = 'aal1' | 'aal2' | null;
export type MfaDecision = 'ok' | 'verify' | 'enroll';

/** Wo der zweite Faktor eingerichtet und verwaltet wird. */
export const MFA_SETTINGS_PATH = '/dashboard/sicherheit';
/** Wo er fuer die laufende Sitzung bestaetigt wird. */
export const MFA_CHALLENGE_PATH = '/dashboard/sicherheit/bestaetigen';

export function mfaDecision(input: {
  currentLevel: AssuranceLevel;
  nextLevel: AssuranceLevel;
  required: boolean;
}): MfaDecision {
  // Ein Konto mit bestaetigtem Faktor, dessen Sitzung ihn noch nicht gesehen
  // hat: bestaetigen. Das gilt unabhaengig davon, ob der Betrieb ihn
  // verlangt -- wer ihn freiwillig eingerichtet hat, soll ihn auch nutzen.
  if (input.nextLevel === 'aal2' && input.currentLevel !== 'aal2') return 'verify';
  if (input.required && input.nextLevel !== 'aal2') return 'enroll';
  return 'ok';
}

/**
 * Wohin umgeleitet wird, oder null.
 *
 * Die Sicherheitsseiten selbst sind ausgenommen, sonst leitet der Riegel auf
 * sich selbst und die Seite laedt nie fertig. Sie zeigen nichts, was ein
 * zweiter Faktor schuetzen muesste: die eigenen Faktoren und ein Eingabefeld.
 */
export function mfaRedirect(decision: MfaDecision, pathname: string | null): string | null {
  if (decision === 'ok') return null;
  if (pathname && pathname.startsWith(MFA_SETTINGS_PATH)) return null;
  return decision === 'verify' ? MFA_CHALLENGE_PATH : `${MFA_SETTINGS_PATH}?einrichten=1`;
}

/** Ein TOTP-Code ist sechs Ziffern; Leerzeichen und Bindestriche fliegen raus. */
export function normalizeTotpCode(raw: unknown): string | null {
  const digits = String(raw ?? '').replace(/[\s-]/g, '');
  return /^\d{6}$/.test(digits) ? digits : null;
}
