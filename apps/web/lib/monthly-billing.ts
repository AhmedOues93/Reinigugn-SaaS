/**
 * Der Monatslauf, soweit er ohne Datenbank zu beschreiben ist.
 *
 * Die Ergebnisse kommen als kurze Schluessel aus der Datenbank; hier stehen
 * die Saetze dazu. Sie sind bewusst ausfuehrlich: wer am Monatsende hundert
 * Zeilen durchsieht, soll nicht raten muessen, warum bei einem Kunden nichts
 * passiert ist.
 */

export type BillingRunOutcome =
  | 'WOULD_CREATE'
  | 'WOULD_EXTEND'
  | 'CREATED'
  | 'EXTENDED'
  | 'NO_PRICE'
  | 'NOTHING_TO_BILL';

export type BillingRunRow = {
  customerId: string;
  customerName: string;
  invoiceId: string | null;
  outcome: BillingRunOutcome;
  linesAdded: number;
  skippedWithoutPrice: number;
  netTotalCents: number;
  reason: string | null;
};

export const outcomeLabel: Record<BillingRunOutcome, string> = {
  WOULD_CREATE: 'Neuer Entwurf',
  WOULD_EXTEND: 'Entwurf ergänzen',
  CREATED: 'Entwurf angelegt',
  EXTENDED: 'Entwurf ergänzt',
  NO_PRICE: 'Preis fehlt',
  NOTHING_TO_BILL: 'Nichts abzurechnen',
};

export const outcomeTone: Record<BillingRunOutcome, 'success' | 'warning' | 'neutral'> = {
  WOULD_CREATE: 'success',
  WOULD_EXTEND: 'success',
  CREATED: 'success',
  EXTENDED: 'success',
  NO_PRICE: 'warning',
  NOTHING_TO_BILL: 'neutral',
};

/**
 * Was der Lauf insgesamt tun wuerde.
 *
 * `customersWithoutPrice` ist die Zahl, die zaehlt: dort liegt Geld, das nicht
 * abgerechnet wird, und niemand merkt es von allein.
 */
export function summarizeRun(rows: BillingRunRow[]) {
  return {
    customers: rows.length,
    invoices: rows.filter((row) => row.linesAdded > 0).length,
    lines: rows.reduce((total, row) => total + row.linesAdded, 0),
    netTotalCents: rows.reduce((total, row) => total + row.netTotalCents, 0),
    customersWithoutPrice: rows.filter((row) => row.skippedWithoutPrice > 0).length,
    skippedWithoutPrice: rows.reduce((total, row) => total + row.skippedWithoutPrice, 0),
  };
}

/** Der letzte abgeschlossene Monat -- der einzige, der abgerechnet werden darf. */
export function lastClosedMonth(today = new Date()): string {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const previous = new Date(Date.UTC(year, month - 1, 1));
  return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Ob ein Monat abgerechnet werden darf. Der laufende nicht: es fehlen Einsaetze. */
export function isClosedMonth(month: string, today = new Date()): boolean {
  if (!/^\d{4}-\d{2}$/.test(month)) return false;
  const [year, index] = month.split('-').map(Number);
  const monthEnd = Date.UTC(year!, index!, 0);
  return monthEnd < Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
}
