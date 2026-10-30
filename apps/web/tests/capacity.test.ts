import { describe, expect, it } from 'vitest';
import { hoursFromMinutes, utilisationPercent, utilisationTone } from '@/lib/capacity';

describe('utilisationPercent', () => {
  it('rechnet Ist gegen Soll', () => {
    expect(utilisationPercent(4800, 9600)).toBe(50);
    expect(utilisationPercent(9600, 9600)).toBe(100);
  });

  it('gibt null, wenn kein Soll vereinbart ist -- nicht 0 und nicht 100', () => {
    expect(utilisationPercent(4800, null)).toBeNull();
    expect(utilisationPercent(4800, 0)).toBeNull();
    expect(utilisationPercent(0, null)).toBeNull();
  });

  it('beschoenigt Ueberstunden nicht durch Deckeln', () => {
    expect(utilisationPercent(12000, 9600)).toBe(125);
  });

  it('ist bei null Ist ehrlich null Prozent, wenn ein Soll besteht', () => {
    expect(utilisationPercent(0, 9600)).toBe(0);
  });
});

describe('utilisationTone', () => {
  it('meldet zu wenig und zu viel, und schweigt dazwischen', () => {
    expect(utilisationTone(70)).toBe('warning');
    expect(utilisationTone(84)).toBe('warning');
    expect(utilisationTone(85)).toBe('success');
    expect(utilisationTone(100)).toBe('success');
    expect(utilisationTone(115)).toBe('success');
    expect(utilisationTone(116)).toBe('danger');
  });

  it('faerbt nichts ein, wo es keine Zahl gibt', () => {
    expect(utilisationTone(null)).toBe('neutral');
  });
});

describe('hoursFromMinutes', () => {
  it('rundet auf eine Nachkommastelle', () => {
    expect(hoursFromMinutes(480)).toBe(8);
    expect(hoursFromMinutes(90)).toBe(1.5);
    expect(hoursFromMinutes(305)).toBe(5.1);
    expect(hoursFromMinutes(0)).toBe(0);
  });
});
