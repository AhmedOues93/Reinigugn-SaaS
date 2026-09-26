/**
 * Demo and acceptance-test tenants carry a marker on free-text fields so the
 * data is recognisable in the database. Two spellings are in circulation:
 * `TESTDATEN – ...` and `[TESTDATEN] ...`.
 *
 * Neither belongs on a screen a cleaning company shows to its own staff or
 * customers, so the marker is stripped at the point of display rather than
 * rewritten in the data. Stripping only ever removes a leading marker; the
 * text itself is never altered.
 */
const DEMO_PREFIX = /^\s*(?:\[\s*TESTDATEN\s*\]|TESTDATEN)\s*[–—:-]?\s*/i;

export function stripDemoPrefix(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(DEMO_PREFIX, '').trim();
}
