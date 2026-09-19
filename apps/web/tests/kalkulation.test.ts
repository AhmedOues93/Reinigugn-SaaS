import { describe, expect, it } from 'vitest';
import { formatBp, formatMinutes, frequencyLabels, unitLabels } from '@/lib/kalkulation';

/**
 * The pure side of the Kalkulation domain.
 *
 * The arithmetic itself lives in the database — one implementation, so a screen
 * cannot disagree with what an Angebot was generated from — and is asserted in
 * supabase/test/kalkulation.test.sql. What is tested here is the presentation
 * layer that turns those stored figures into something an office reads, plus
 * the label maps, which are the part a careless rename would silently break.
 */
describe('Kalkulation presentation', () => {
  it('reads basis points as a percentage', () => {
    expect(formatBp(3000)).toBe('30,0 %');
    expect(formatBp(4286)).toBe('42,9 %');
    expect(formatBp(0)).toBe('0,0 %');
    expect(formatBp(10000)).toBe('100,0 %');
  });

  it('reads minutes the way a timesheet does', () => {
    expect(formatMinutes(120)).toBe('2 h 00');
    expect(formatMinutes(2600)).toBe('43 h 20');
    expect(formatMinutes(0)).toBe('0 h 00');
    expect(formatMinutes(59)).toBe('0 h 59');
    // Fractional minutes come from the database as numerics; rounding must not
    // produce "1 h 60".
    expect(formatMinutes(119.6)).toBe('2 h 00');
  });

  it('names every calculation unit and frequency', () => {
    // A missing entry renders `undefined` in a dropdown, which is how a unit
    // quietly becomes unselectable.
    expect(Object.keys(unitLabels).sort()).toEqual(['EINSATZ', 'PAUSCHAL', 'QM', 'STUECK', 'STUNDE']);
    expect(Object.values(unitLabels).every((label) => label.length > 0)).toBe(true);
    expect(Object.keys(frequencyLabels).sort()).toEqual(['EINMALIG', 'PRO_MONAT', 'PRO_WOCHE']);
  });
});

/**
 * Markup and margin, restated here in TypeScript.
 *
 * Not because the application computes them — it does not — but because this
 * is the distinction the whole pricing model rests on, and a test that states
 * it in plain arithmetic is the clearest documentation of why the two numbers
 * are shown side by side.
 */
describe('markup is not margin', () => {
  const priceFromMargin = (costCents: number, marginBp: number) =>
    marginBp <= 0 ? costCents : Math.round(costCents / (1 - marginBp / 10000));
  const marginBp = (price: number, cost: number) =>
    price === 0 ? 0 : Math.round(((price - cost) / price) * 10000);
  const markupBp = (price: number, cost: number) =>
    cost === 0 ? 0 : Math.round(((price - cost) / cost) * 10000);

  it('prices a 30 % margin above a 30 % markup', () => {
    const cost = 10_000;
    expect(priceFromMargin(cost, 3000)).toBe(14_286);
    expect(Math.round(cost * 1.3)).toBe(13_000);
  });

  it('reports the same price as a 30 % margin and a 42.86 % markup', () => {
    expect(marginBp(14_286, 10_000)).toBe(3000);
    expect(markupBp(14_286, 10_000)).toBe(4286);
  });

  it('shows what "cost plus 30 %" actually earns', () => {
    // The mistake this guards against: quoting cost + 30 % while believing the
    // result carries a 30 % margin. It carries 23.08 %.
    expect(marginBp(13_000, 10_000)).toBe(2308);
  });

  it('never divides by zero', () => {
    expect(marginBp(0, 1000)).toBe(0);
    expect(markupBp(1000, 0)).toBe(0);
    expect(priceFromMargin(10_000, 0)).toBe(10_000);
  });
});
