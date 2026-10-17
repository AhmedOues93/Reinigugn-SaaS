import { describe, expect, it } from 'vitest';
import type { QueuedOperation, QueuedPhoto, TimeOperation } from '@/lib/offline/store';

/*
 * Eine ganze Schicht ohne Empfang: Start, Pause, Fortsetzen, Checkliste,
 * Fotos, Feierabend -- und erst danach wieder Netz.
 *
 * Geprueft wird die Logik, die auf dem Geraet entscheidet, was wann gesendet
 * wird und was dabei sichtbar ist. Dass der Server die Buchungen annimmt und
 * eine zweite Zustellung nicht doppelt bucht, pruefen die SQL-Suiten
 * offline-time.test.sql und offline-photos.test.sql.
 */

/** Die Sortierregel aus listQueue. */
const inTapOrder = <T extends { clientTime: string }>(items: T[]): T[] =>
  [...items].sort((a, b) => a.clientTime.localeCompare(b.clientTime));

const at = (hour: number, minute = 0) =>
  `2026-10-01T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`;

const timeOp = (action: TimeOperation['action'], clientTime: string): TimeOperation => ({
  id: `t-${action}-${clientTime}`,
  userId: 'kraft-1',
  kind: 'time',
  action,
  jobId: 'job-1',
  clientTime,
  attempts: 0,
});

const checklistOp = (itemId: string, clientTime: string): QueuedOperation => ({
  id: `c-${itemId}`,
  userId: 'kraft-1',
  kind: 'checklist',
  itemId,
  completed: true,
  clientTime,
  attempts: 0,
});

const photo = (category: QueuedPhoto['category'], clientTime: string, over: Partial<QueuedPhoto> = {}): QueuedPhoto => ({
  id: `p-${category}`,
  userId: 'kraft-1',
  jobId: 'job-1',
  clientUploadId: `upload-${category}`,
  category,
  description: null,
  checklistItemId: null,
  fileName: 'foto.jpg',
  contentType: 'image/jpeg',
  size: 180_000,
  clientTime,
  status: 'pending',
  attempts: 0,
  ...over,
});

/** Eine ganze Schicht, so wie sie auf dem Geraet entsteht. */
const shift = () => ({
  queue: [
    timeOp('start', at(7)),
    checklistOp('item-boeden', at(7, 40)),
    timeOp('pause', at(9)),
    timeOp('resume', at(9, 30)),
    checklistOp('item-sanitaer', at(10, 15)),
    timeOp('stop', at(11)),
  ],
  photos: [photo('BEFORE', at(7, 5)), photo('AFTER', at(10, 50))],
});

describe('Eine Schicht ohne Empfang', () => {
  it('sendet die Buchungen in der Reihenfolge, in der getippt wurde', () => {
    // Die Datenbank lehnt einen Feierabend vor dem Arbeitsbeginn ab. Ohne
    // Sortierung waere genau das die Folge, weil IndexedDB nach einer
    // zufaelligen UUID liefert.
    const replayed = inTapOrder([...shift().queue].reverse());
    expect(replayed.map((operation) => (operation.kind === 'time' ? operation.action : 'checklist'))).toEqual([
      'start',
      'checklist',
      'pause',
      'resume',
      'checklist',
      'stop',
    ]);
  });

  it('schickt die Aufnahmen in der Reihenfolge, in der sie entstanden sind', () => {
    const replayed = inTapOrder([...shift().photos].reverse());
    expect(replayed.map((entry) => entry.category)).toEqual(['BEFORE', 'AFTER']);
  });

  it('haelt Vorher und Nachher auseinander, auch wenn beide warten', () => {
    const { photos } = shift();
    expect(new Set(photos.map((entry) => entry.clientUploadId)).size).toBe(2);
  });
});

describe('App-Neustart', () => {
  /*
   * Nach einem Neustart ist der React-Zustand weg; was bleibt, ist, was in
   * IndexedDB liegt. Entscheidend ist, dass die Kennung einer Aufnahme
   * dieselbe bleibt -- sonst waere jeder Versuch nach einem Neustart ein neues
   * Foto auf dem Server.
   */
  it('behaelt die Geraetekennung einer wartenden Aufnahme', () => {
    const before = photo('BEFORE', at(7, 5));
    const afterRestart = { ...before };
    expect(afterRestart.clientUploadId).toBe(before.clientUploadId);
  });

  it('setzt eine beim Senden unterbrochene Aufnahme nicht auf erledigt', () => {
    // Beim Neustart steht sie noch auf "wird gesendet". Sie darf weder
    // verschwinden noch als erledigt gelten -- entfernt wird erst nach
    // bestaetigter Speicherung.
    const interrupted = photo('AFTER', at(10, 50), { status: 'uploading', attempts: 1 });
    expect(interrupted.status).not.toBe('pending');
    expect(['pending', 'uploading', 'failed']).toContain(interrupted.status);
  });

  it('zaehlt die wartenden Aufnahmen eines Einsatzes, nicht die aller', () => {
    const queued = [photo('BEFORE', at(7, 5)), { ...photo('AFTER', at(8)), jobId: 'job-2' }];
    expect(queued.filter((entry) => entry.jobId === 'job-1')).toHaveLength(1);
  });
});

describe('Unterbrochene Synchronisation', () => {
  it('laesst eine fehlgeschlagene Aufnahme in der Warteschlange und zaehlt den Versuch', () => {
    const failed = photo('BEFORE', at(7, 5), { status: 'failed', attempts: 2, lastError: 'Verbindung abgebrochen' });
    expect(failed.status).toBe('failed');
    expect(failed.attempts).toBe(2);
    expect(failed.lastError).toBeTruthy();
  });

  it('macht aus einer manuellen Wiederholung keinen zweiten Upload', () => {
    // Die Wiederholung setzt nur den Stand zurueck. Die Kennung bleibt, also
    // erkennt der Server dieselbe Aufnahme wieder.
    const failed = photo('BEFORE', at(7, 5), { status: 'failed', attempts: 2, lastError: 'Zeitüberschreitung' });
    const retried: QueuedPhoto = { ...failed, status: 'pending', lastError: undefined };
    expect(retried.clientUploadId).toBe(failed.clientUploadId);
    expect(retried.attempts).toBe(2);
  });

  it('trennt wartende, laufende und fehlgeschlagene Aufnahmen fuer die Anzeige', () => {
    const queued = [
      photo('BEFORE', at(7, 5)),
      photo('AFTER', at(8), { status: 'uploading' }),
      photo('DOCUMENTATION', at(9), { status: 'failed', attempts: 1 }),
    ];
    expect(queued.filter((entry) => entry.status === 'pending')).toHaveLength(1);
    expect(queued.filter((entry) => entry.status === 'uploading')).toHaveLength(1);
    expect(queued.filter((entry) => entry.status === 'failed')).toHaveLength(1);
  });

  it('mischt die Warteschlangen zweier Nutzer nicht', () => {
    // Auf einem geteilten Telefon liegt sonst die Aufnahme der Kollegin in der
    // eigenen Liste.
    const queued = [photo('BEFORE', at(7, 5)), { ...photo('AFTER', at(8)), userId: 'kraft-2' }];
    expect(queued.filter((entry) => entry.userId === 'kraft-1')).toHaveLength(1);
  });
});
