import { describe, expect, it } from 'vitest';
import type { QueuedOperation, TimeOperation } from '@/lib/offline/store';

/*
 * Die Reihenfolge der Warteschlange.
 *
 * IndexedDB liefert nach Schluessel, und der Schluessel ist eine zufaellige
 * UUID. Ohne Sortierung kaeme der Feierabend vor dem Start beim Server an --
 * und der lehnt ihn zu Recht ab ("Der Feierabend liegt vor dem
 * Arbeitsbeginn"). Diese Tests halten die Sortierregel fest, die listQueue
 * anwendet, damit sie nicht wieder herausfaellt.
 */
const bySortOrder = (queue: QueuedOperation[]) =>
  [...queue].sort((a, b) => a.clientTime.localeCompare(b.clientTime));

const time = (id: string, action: TimeOperation['action'], clientTime: string): TimeOperation => ({
  id,
  userId: 'user-1',
  kind: 'time',
  action,
  jobId: 'job-1',
  clientTime,
  attempts: 0,
});

describe('Reihenfolge der Zeitbuchungen', () => {
  it('spielt eine Schicht in der Reihenfolge ab, in der getippt wurde', () => {
    // Bewusst verdreht eingefuegt: so liefert IndexedDB sie auch.
    const queue = [
      time('d', 'stop', '2026-10-01T15:00:00.000Z'),
      time('a', 'start', '2026-10-01T07:00:00.000Z'),
      time('c', 'resume', '2026-10-01T12:30:00.000Z'),
      time('b', 'pause', '2026-10-01T12:00:00.000Z'),
    ];
    expect(bySortOrder(queue).map((operation) => operation.action)).toEqual([
      'start',
      'pause',
      'resume',
      'stop',
    ]);
  });

  it('sortiert ISO-Zeitstempel zuverlaessig als Text', () => {
    // Der Vergleich ist eine Textsortierung. Das geht nur auf, solange die
    // Stempel dieselbe Form haben -- ISO mit Z, wie toISOString sie liefert.
    const queue = [
      time('b', 'stop', '2026-10-01T09:05:00.000Z'),
      time('a', 'start', '2026-10-01T09:04:59.999Z'),
    ];
    expect(bySortOrder(queue).map((operation) => operation.id)).toEqual(['a', 'b']);
  });

  it('bringt eine ueber Mitternacht laufende Schicht nicht durcheinander', () => {
    const queue = [
      time('b', 'stop', '2026-10-02T02:00:00.000Z'),
      time('a', 'start', '2026-10-01T22:00:00.000Z'),
    ];
    expect(bySortOrder(queue).map((operation) => operation.action)).toEqual(['start', 'stop']);
  });
});

describe('Hochrechnung auf dem Geraet', () => {
  /*
   * Dieselbe Rechnung wie in JobTimeControl: aus den noch nicht uebertragenen
   * Buchungen ergibt sich, was die Mitarbeiterin sieht, solange kein Netz da
   * ist.
   */
  const overlay = (queued: TimeOperation[]) => {
    const breaks: { started_at: string; ended_at: string | null }[] = [];
    let start: string | null = null;
    let finish: string | null = null;
    for (const operation of bySortOrder(queued) as TimeOperation[]) {
      if (operation.action === 'start') start = operation.clientTime;
      if (operation.action === 'stop') finish = operation.clientTime;
      if (operation.action === 'pause') breaks.push({ started_at: operation.clientTime, ended_at: null });
      if (operation.action === 'resume') {
        const open = breaks.find((entry) => !entry.ended_at);
        if (open) open.ended_at = operation.clientTime;
      }
    }
    return { start, finish, breaks, running: Boolean(start) && !finish };
  };

  it('zeigt die Uhr als laufend, sobald der Start in der Warteschlange liegt', () => {
    const state = overlay([time('a', 'start', '2026-10-01T07:00:00.000Z')]);
    expect(state.running).toBe(true);
    expect(state.start).toBe('2026-10-01T07:00:00.000Z');
  });

  it('schliesst die Pause, wenn das Fortsetzen dazukommt', () => {
    const state = overlay([
      time('a', 'start', '2026-10-01T07:00:00.000Z'),
      time('b', 'pause', '2026-10-01T09:00:00.000Z'),
      time('c', 'resume', '2026-10-01T09:30:00.000Z'),
    ]);
    expect(state.breaks).toEqual([
      { started_at: '2026-10-01T09:00:00.000Z', ended_at: '2026-10-01T09:30:00.000Z' },
    ]);
    expect(state.running).toBe(true);
  });

  it('haelt eine offene Pause offen, damit die Uhr nicht weiterzaehlt', () => {
    const state = overlay([
      time('a', 'start', '2026-10-01T07:00:00.000Z'),
      time('b', 'pause', '2026-10-01T09:00:00.000Z'),
    ]);
    expect(state.breaks[0]?.ended_at).toBeNull();
  });

  it('zeigt den Feierabend, sobald er getippt wurde', () => {
    const state = overlay([
      time('a', 'start', '2026-10-01T07:00:00.000Z'),
      time('d', 'stop', '2026-10-01T15:00:00.000Z'),
    ]);
    expect(state.running).toBe(false);
    expect(state.finish).toBe('2026-10-01T15:00:00.000Z');
  });
});
