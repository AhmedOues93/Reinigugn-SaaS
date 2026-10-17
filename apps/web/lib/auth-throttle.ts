import { createHmac } from 'node:crypto';

/**
 * Die Bremse am eigenen Anmeldeformular.
 *
 * Erst das Wichtigste: das hier ist nicht der Schutz der Anmeldung. Wer
 * Passwoerter durchprobieren will, ruft `/auth/v1/token` bei Supabase Auth
 * direkt auf und kommt an diesem Code nie vorbei. Der verbindliche Riegel sind
 * die Rate Limits und das CAPTCHA von Supabase Auth -- siehe docs/runbook.md.
 * Diese Bremse sitzt eine Schicht davor und ist kein Ersatz.
 *
 * Was hier entschieden wird: Grenze und Fenster stehen in der Datenbank, nicht
 * in diesem Aufruf. Bis einschliesslich Migration 35 kamen sie als Parameter
 * mit, und damit war die Bremse wirkungslos -- `p_limit` gross genug, und jeder
 * Versuch war erlaubt.
 *
 * Der Schluessel ist die Adresse der Person, die sich anmeldet. Supabase sieht
 * an dieser Stelle nur unseren Server, also muessen wir sie mitschicken -- und
 * eine mitgeschickte Adresse ist so viel wert wie ihre Unterschrift. Darum
 * wird sie mit `THROTTLE_SIGNING_SECRET` unterschrieben. Ohne hinterlegtes
 * Geheimnis faellt die Datenbank auf einen gemeinsamen Zaehler mit weiter
 * Grenze zurueck: enger als nichts, aber niemand wird ausgesperrt.
 */

export type ThrottleScope = 'login' | 'password-reset';

export const LOGIN_THROTTLE: ThrottleScope = 'login';
export const PASSWORD_RESET_THROTTLE: ThrottleScope = 'password-reset';

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
 * Die Unterschrift ueber Vorgang und Schluessel.
 *
 * Node-eigene Krypto, kein zusaetzliches Paket, und sie laeuft ausschliesslich
 * auf dem Server -- das Geheimnis traegt bewusst kein `NEXT_PUBLIC_`, damit es
 * nicht in ein Browser-Bundle geraten kann.
 */
export function throttleProof(scope: string, bucket: string, secret: string | undefined): string | null {
  if (!secret || secret.length < 32 || !bucket) return null;
  return createHmac('sha256', secret).update(`${scope}:${bucket}`).digest('hex');
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
