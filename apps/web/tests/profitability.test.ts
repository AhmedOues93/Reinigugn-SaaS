import { describe, expect, it } from 'vitest';
import {
  type ObjectProfitability,
  marginVerdict,
  percentFromBp,
  summarizeProfitability,
} from '@/lib/profitability';

function object(partial: Partial<ObjectProfitability>): ObjectProfitability {
  return {
    objectId: 'o',
    objectName: 'Objekt',
    customerName: 'Kunde',
    visits: 1,
    workedMinutes: 480,
    minutesWithoutRate: 0,
    revenueCents: 24000,
    labourCostCents: 14400,
    marginCents: 9600,
    marginBp: 4000,
    ...partial,
  };
}

describe('marginVerdict', () => {
  it('nennt Verlust Verlust, auch bei fehlender Prozentzahl', () => {
    expect(marginVerdict(-2000, -5000)).toBe('loss');
    expect(marginVerdict(null, -5000)).toBe('loss');
  });

  it('warnt unter fuenfzehn Prozent', () => {
    expect(marginVerdict(1499, 100)).toBe('thin');
    expect(marginVerdict(1500, 100)).toBe('healthy');
  });

  it('bleibt bei unbekannten Kosten unbekannt', () => {
    expect(marginVerdict(null, null)).toBe('unknown');
  });

  it('haelt null Marge nicht fuer Verlust', () => {
    expect(marginVerdict(0, 0)).toBe('thin');
  });
});

describe('summarizeProfitability', () => {
  it('laesst Objekte ohne bekannte Kosten aus den Summen heraus', () => {
    const summary = summarizeProfitability([
      object({ objectId: 'a' }),
      object({
        objectId: 'b',
        revenueCents: 10000,
        labourCostCents: null,
        marginCents: null,
        marginBp: null,
        minutesWithoutRate: 240,
      }),
    ]);
    expect(summary.objects).toBe(2);
    // Der Erloes beider Objekte zaehlt, die Kosten nur des bekannten.
    expect(summary.revenueCents).toBe(34000);
    expect(summary.knownCostCents).toBe(14400);
    expect(summary.knownMarginCents).toBe(9600);
    expect(summary.objectsWithoutCost).toBe(1);
  });

  it('zaehlt die Objekte im Verlust', () => {
    const summary = summarizeProfitability([
      object({ objectId: 'a', marginCents: -1 }),
      object({ objectId: 'b', marginCents: 0 }),
      object({ objectId: 'c', marginCents: 5000 }),
    ]);
    expect(summary.objectsAtLoss).toBe(1);
  });

  it('bleibt bei einer leeren Liste bei null', () => {
    expect(summarizeProfitability([])).toEqual({
      objects: 0,
      revenueCents: 0,
      knownCostCents: 0,
      knownMarginCents: 0,
      objectsAtLoss: 0,
      objectsWithoutCost: 0,
    });
  });
});

describe('percentFromBp', () => {
  it('rechnet Basispunkte in Prozent', () => {
    expect(percentFromBp(4000)).toBe(40);
    expect(percentFromBp(-1560)).toBe(-16);
    // Math.round rundet die Haelfte nach oben, also bei negativen Werten
    // Richtung null. Auf eine Prozentangabe hat das keinen Einfluss, der
    // jemanden interessiert -- festgehalten, damit es keiner fuer einen
    // Fehler haelt.
    expect(percentFromBp(-1550)).toBe(-15);
    expect(percentFromBp(null)).toBeNull();
  });
});
