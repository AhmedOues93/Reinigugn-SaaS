/**
 * Zugang eines Betriebs: darf er arbeiten, und welche Seiten bleiben offen,
 * wenn nicht?
 *
 * Die Regel selbst steht genau einmal, in `public.company_has_access` in der
 * Datenbank. Dort wirkt sie auch als Schreibsperre an der App vorbei. Hier
 * steht nur, was die App daraus macht: wohin umgeleitet wird und welche Pfade
 * ein Betrieb ohne Zugang noch erreichen muss, um das Problem zu loesen (Abo,
 * Zwei-Faktor) oder seine Daten mitzunehmen (Exporte).
 */

export const ACCESS_PAUSED_PATH = '/zugang-pausiert';

export type AccessReason = 'OK' | 'TRIAL_ENDED' | 'SUBSCRIPTION_ENDED' | 'SUSPENDED';

const staffPrefixes = [
  '/dashboard/abo',
  '/dashboard/sicherheit',
];

/** Downloads, die ein Betrieb auch ohne Zugang behaelt: seine eigenen Daten. */
const staffExportPatterns = [
  /^\/dashboard\/abrechnung\/datev$/,
  /^\/dashboard\/abrechnung\/buchhaltung$/,
  /^\/dashboard\/arbeitszeiten\/export$/,
  /^\/dashboard\/arbeitszeiten\/monatsabschluss\/export$/,
  /^\/dashboard\/abrechnung\/[^/]+\/(pdf|xrechnung|zugferd-pdf|zugferd-xml)$/,
];

function startsWithSegment(path: string, prefix: string) {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/**
 * Ob ein Pfad ohne Zugang erreichbar bleibt.
 *
 * Ohne bekannten Pfad (ausserhalb einer Anfrage) wird nichts freigegeben: im
 * Zweifel landet man auf der Hinweisseite, nicht in den Daten.
 */
export function isPathAllowedWithoutAccess(pathname: string | null | undefined, role: string | null | undefined): boolean {
  if (!pathname) return false;
  const path = pathname.split('?')[0].replace(/\/+$/, '') || '/';
  if (startsWithSegment(path, ACCESS_PAUSED_PATH)) return true;
  if (role !== 'OWNER' && role !== 'OFFICE') return false;
  if (staffPrefixes.some((prefix) => startsWithSegment(path, prefix))) return true;
  return staffExportPatterns.some((pattern) => pattern.test(path));
}

export function isAccessReason(value: unknown): value is AccessReason {
  return value === 'OK' || value === 'TRIAL_ENDED' || value === 'SUBSCRIPTION_ENDED' || value === 'SUSPENDED';
}
