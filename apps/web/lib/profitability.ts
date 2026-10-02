/**
 * Objektrentabilitaet, soweit sie ohne Datenbank zu beschreiben ist.
 *
 * `labourCostCents`, `marginCents` und `marginBp` sind null, wenn fuer
 * irgendeine erfasste Minute kein Stundenlohn hinterlegt war. Das ist kein
 * Randfall, den man wegrunden kann: eine ausgedachte Marge wird zur Grundlage
 * einer Kuendigung.
 */

export type ObjectProfitability = {
  objectId: string;
  objectName: string;
  customerName: string;
  visits: number;
  workedMinutes: number;
  minutesWithoutRate: number;
  revenueCents: number;
  labourCostCents: number | null;
  marginCents: number | null;
  marginBp: number | null;
};

export type MarginVerdict = 'unknown' | 'loss' | 'thin' | 'healthy';

/**
 * Wie eine Marge zu lesen ist.
 *
 * Die Grenze bei 15 Prozent ist keine Naturkonstante, sondern eine Warnlinie:
 * darunter traegt ein Objekt seine Gemeinkosten nicht mehr. Verlust ist
 * Verlust, und unbekannt bleibt unbekannt.
 */
export function marginVerdict(marginBp: number | null, marginCents: number | null): MarginVerdict {
  if (marginBp === null && marginCents === null) return 'unknown';
  if ((marginCents ?? 0) < 0) return 'loss';
  if (marginBp !== null && marginBp < 1500) return 'thin';
  return 'healthy';
}

export const verdictLabel: Record<MarginVerdict, string> = {
  unknown: 'Kosten unbekannt',
  loss: 'Verlust',
  thin: 'Knapp',
  healthy: 'Tragfähig',
};

export const verdictTone: Record<MarginVerdict, 'neutral' | 'danger' | 'warning' | 'success'> = {
  unknown: 'neutral',
  loss: 'danger',
  thin: 'warning',
  healthy: 'success',
};

/**
 * Was der Zeitraum insgesamt ergibt.
 *
 * Objekte ohne bekannte Kosten bleiben aus Kosten und Marge heraus und werden
 * stattdessen gezaehlt. Sie mitzurechnen hiesse, ihre Kosten auf null zu
 * setzen, und das sieht nach Gewinn aus.
 */
export function summarizeProfitability(rows: ObjectProfitability[]) {
  const known = rows.filter((row) => row.marginCents !== null);
  return {
    objects: rows.length,
    revenueCents: rows.reduce((total, row) => total + row.revenueCents, 0),
    knownCostCents: known.reduce((total, row) => total + (row.labourCostCents ?? 0), 0),
    knownMarginCents: known.reduce((total, row) => total + (row.marginCents ?? 0), 0),
    objectsAtLoss: rows.filter((row) => (row.marginCents ?? 0) < 0).length,
    objectsWithoutCost: rows.length - known.length,
  };
}

/** Basispunkte als Prozentzahl, wie sie gelesen wird. */
export function percentFromBp(basisPoints: number | null): number | null {
  return basisPoints === null ? null : Math.round(basisPoints / 100);
}
