/**
 * Die Bremse am Anmeldeformular.
 *
 * Zwei Dinge sind hier bewusst entschieden:
 *
 * Erstens der Schluessel. Gezaehlt wird pro IP-Adresse, nicht pro
 * E-Mail-Adresse. Eine Bremse pro Adresse klingt praeziser, laesst sich aber
 * gegen die Betroffene wenden: es genuegt, oft genug ein falsches Passwort
 * fuer ihre Adresse zu schicken, und sie kommt selbst nicht mehr herein. Wer
 * die IP-Bremse ausloest, sperrt nur sich selbst aus.
 *
 * Zweitens das Verhalten ohne IP. Next.js gibt einer Server Action keine
 * Gegenstelle, nur Kopfzeilen; hinter Vercel setzt die Plattform sie, lokal
 * ohne Proxy fehlen sie. Fehlt die Adresse, wird nicht gebremst -- eine
 * gemeinsame Zeile fuer alle Namenlosen waere eine Sperre, die der erste
 * Angreifer fuer den gesamten Betrieb ausloest.
 */

export type ThrottleConfig = { scope: string; limit: number; windowSeconds: number };

/** Zehn Versuche in zehn Minuten. Wer sein Passwort sucht, kommt damit aus. */
export const LOGIN_THROTTLE: ThrottleConfig = { scope: 'login', limit: 10, windowSeconds: 600 };

/** Passwort-Mails sind teuer und laut: fuenf in einer Viertelstunde genuegen. */
export const PASSWORD_RESET_THROTTLE: ThrottleConfig = { scope: 'password-reset', limit: 5, windowSeconds: 900 };

/**
 * Die Adresse der Aufrufenden aus den Kopfzeilen, oder null.
 *
 * `x-forwarded-for` kann die Aufrufende selbst mitschicken; verlaesslich ist
 * sie nur, weil die Plattform davor sie ueberschreibt. Darum wird der von
 * Vercel eigens gesetzte Wert bevorzugt und erst danach die allgemeine
 * Kopfzeile gelesen.
 */
export function clientAddress(read: (name: string) => string | null | undefined): string | null {
  for (const name of ['x-vercel-forwarded-for', 'x-real-ip', 'x-forwarded-for']) {
    const first = (read(name) ?? '').split(',')[0]?.trim();
    if (first) return first.slice(0, 100);
  }
  return null;
}

/**
 * Wie lange noch, in Worten, die jemand am Telefon weitergeben kann.
 */
export function throttleMessage(retryAfterSeconds: number): string {
  const seconds = Math.max(0, Math.ceil(retryAfterSeconds));
  const minutes = Math.ceil(seconds / 60);
  const wait = seconds <= 60 ? 'einer Minute' : `${minutes} Minuten`;
  return `Zu viele Anmeldeversuche von diesem Anschluss. Bitte versuche es in ${wait} erneut.`;
}
