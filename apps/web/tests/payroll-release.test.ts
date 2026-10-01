import { describe, expect, it } from 'vitest';
import { hoursAndMinutes, monthKey, nextMonth, overtimeMinutes, previousMonth } from '@/lib/data/monthly-summary';

/*
 * Die Rechenregeln rund um den Monatsabschluss.
 *
 * Dass die Freigabe sperrt und der eingefrorene Abzug erhalten bleibt, prueft
 * supabase/test/payroll-release.test.sql gegen die Datenbank. Hier stehen die
 * Umrechnungen, die in der CSV landen -- ein Fehler darin faellt sonst erst
 * beim Lohnbuero auf.
 */
describe('Stunden in der Form, die ein Stundenzettel benutzt', () => {
  it('schreibt 38:30 statt 38,5', () => {
    expect(hoursAndMinutes(2310)).toBe('38:30');
  });

  it('fuellt die Minuten auf zwei Stellen auf', () => {
    expect(hoursAndMinutes(305)).toBe('5:05');
  });

  it('zeigt Minusstunden mit echtem Minuszeichen', () => {
    // Ein Bindestrich sieht in Excel aus wie ein Trennstrich.
    expect(hoursAndMinutes(-90)).toBe('−1:30');
  });

  it('macht aus fehlenden Stunden einen Strich, keine Null', () => {
    // Null Stunden und "nicht bekannt" sind verschiedene Aussagen.
    expect(hoursAndMinutes(null)).toBe('—');
    expect(hoursAndMinutes(0)).toBe('0:00');
  });
});

describe('Differenz zum Soll', () => {
  it('rechnet Ist minus Soll', () => {
    expect(overtimeMinutes({ worked_minutes: 2400, target_minutes: 2310 })).toBe(90);
    expect(overtimeMinutes({ worked_minutes: 2220, target_minutes: 2310 })).toBe(-90);
  });

  it('gibt ohne vereinbarte Wochenstunden keine Differenz aus', () => {
    // Ohne Soll gibt es keine Ueberstunden -- erfundene Null waere eine Aussage
    // ueber einen Vertrag, den niemand hinterlegt hat.
    expect(overtimeMinutes({ worked_minutes: 2400, target_minutes: null })).toBeNull();
  });
});

describe('Monatsschluessel', () => {
  it('normalisiert auf den Monatsersten', () => {
    expect(monthKey('2026-09')).toBe('2026-09-01');
  });

  it('faellt bei Unsinn auf den laufenden Monat zurueck, statt zu werfen', () => {
    expect(monthKey('letzter')).toMatch(/^\d{4}-\d{2}-01$/);
    expect(monthKey(null)).toMatch(/^\d{4}-\d{2}-01$/);
  });

  it('geht ueber den Jahreswechsel richtig vor und zurueck', () => {
    expect(previousMonth('2026-01')).toBe('2025-12');
    expect(nextMonth('2026-12')).toBe('2027-01');
  });
});
