/**
 * The Reinigungsarten a company can declare.
 *
 * Deliberately free of any server import. `lib/data/onboarding.ts` reaches
 * `next/headers` through the Supabase server client, so a client component that
 * imported this list from there would drag server-only code into the browser
 * bundle and fail the build — the same trap `lib/kalkulation.ts` exists to
 * avoid.
 *
 * The list seeds a starting Leistungskatalog and afterwards only hints at what
 * a company does. It is never a restriction on what can be calculated.
 */
export const serviceFocusOptions = [
  { value: 'UNTERHALTSREINIGUNG', label: 'Unterhaltsreinigung' },
  { value: 'BUEROREINIGUNG', label: 'Büroreinigung' },
  { value: 'SANITAERREINIGUNG', label: 'Sanitärreinigung' },
  { value: 'TREPPENHAUSREINIGUNG', label: 'Treppenhausreinigung' },
  { value: 'GLASREINIGUNG', label: 'Glasreinigung' },
  { value: 'GRUNDREINIGUNG', label: 'Grundreinigung' },
  { value: 'BAUENDREINIGUNG', label: 'Bauendreinigung' },
  { value: 'PRAXISREINIGUNG', label: 'Praxisreinigung' },
  { value: 'KITA_SCHULE', label: 'Kita und Schule' },
  { value: 'INDUSTRIE', label: 'Industrie' },
  { value: 'SONDERREINIGUNG', label: 'Sonderreinigung' },
] as const;

export type ServiceFocus = (typeof serviceFocusOptions)[number]['value'];
