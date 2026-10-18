import { describe, expect, it } from 'vitest';
import {
  type BillingRunRow,
  isClosedMonth,
  lastClosedMonth,
  outcomeLabel,
  summarizeRun,
} from '@/lib/monthly-billing';

function row(partial: Partial<BillingRunRow>): BillingRunRow {
  return {
    customerId: 'c',
    customerName: 'Kunde',
    invoiceId: null,
    outcome: 'NOTHING_TO_BILL',
    linesAdded: 0,
    skippedWithoutPrice: 0,
    netTotalCents: 0,
    reason: null,
    ...partial,
  };
}

describe('summarizeRun', () => {
  it('zaehlt nur Kunden mit Positionen als Entwurf', () => {
    const summary = summarizeRun([
      row({ customerId: 'a', outcome: 'WOULD_CREATE', linesAdded: 2, netTotalCents: 9600 }),
      row({ customerId: 'b', outcome: 'NOTHING_TO_BILL' }),
      row({ customerId: 'c', outcome: 'NO_PRICE', skippedWithoutPrice: 3 }),
    ]);
    expect(summary.customers).toBe(3);
    expect(summary.invoices).toBe(1);
    expect(summary.lines).toBe(2);
    expect(summary.netTotalCents).toBe(9600);
  });

  it('macht sichtbar, wo Geld liegen bleibt', () => {
    const summary = summarizeRun([
      row({ customerId: 'a', outcome: 'NO_PRICE', skippedWithoutPrice: 3 }),
      row({ customerId: 'b', outcome: 'WOULD_CREATE', linesAdded: 1, skippedWithoutPrice: 2, netTotalCents: 4800 }),
    ]);
    expect(summary.customersWithoutPrice).toBe(2);
    expect(summary.skippedWithoutPrice).toBe(5);
  });

  it('bleibt bei einem leeren Lauf bei null', () => {
    const summary = summarizeRun([]);
    expect(summary).toEqual({
      customers: 0,
      invoices: 0,
      lines: 0,
      netTotalCents: 0,
      customersWithoutPrice: 0,
      skippedWithoutPrice: 0,
    });
  });
});

describe('isClosedMonth', () => {
  const today = new Date('2026-03-15T12:00:00Z');

  it('laesst den Vormonat zu', () => {
    expect(isClosedMonth('2026-02', today)).toBe(true);
    expect(isClosedMonth('2025-12', today)).toBe(true);
  });

  it('weist den laufenden und jeden kuenftigen Monat ab', () => {
    expect(isClosedMonth('2026-03', today)).toBe(false);
    expect(isClosedMonth('2026-04', today)).toBe(false);
  });

  it('weist Unsinn ab, statt ihn zu einem Datum zu machen', () => {
    for (const bad of ['', '2026', '2026-1', 'Februar', '2026-02-01']) {
      expect(isClosedMonth(bad, today)).toBe(false);
    }
  });

  it('gilt am Monatsersten noch nicht fuer den eben begonnenen Monat', () => {
    const firstOfMarch = new Date('2026-03-01T00:30:00Z');
    expect(isClosedMonth('2026-03', firstOfMarch)).toBe(false);
    expect(isClosedMonth('2026-02', firstOfMarch)).toBe(true);
  });
});

describe('lastClosedMonth', () => {
  it('ist der Vormonat', () => {
    expect(lastClosedMonth(new Date('2026-03-15T12:00:00Z'))).toBe('2026-02');
  });

  it('rechnet ueber den Jahreswechsel zurueck', () => {
    expect(lastClosedMonth(new Date('2026-01-04T12:00:00Z'))).toBe('2025-12');
  });

  it('liefert immer einen Monat, der auch abgerechnet werden darf', () => {
    for (const day of ['2026-01-01', '2026-02-28', '2026-12-31', '2027-03-01']) {
      const today = new Date(`${day}T12:00:00Z`);
      expect(isClosedMonth(lastClosedMonth(today), today)).toBe(true);
    }
  });
});

describe('outcomeLabel', () => {
  it('hat fuer jedes Ergebnis der Datenbank einen Satz', () => {
    for (const outcome of ['WOULD_CREATE', 'WOULD_EXTEND', 'CREATED', 'EXTENDED', 'NO_PRICE', 'NOTHING_TO_BILL'] as const) {
      expect(outcomeLabel[outcome]).toBeTruthy();
    }
  });
});
