import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearOfflineData,
  dequeue,
  enqueue,
  listPhotos,
  listQueue,
  listQueuedTime,
  markAttempt,
  readPhotoBlob,
  readSnapshot,
  removePhoto,
  savePhoto,
  saveSnapshot,
  type QueuedPhoto,
  type TimeOperation,
} from '@/lib/offline/store';

/**
 * Der lokale Speicher der Mitarbeiter-App, gegen eine echte IndexedDB.
 *
 * Bisher war diese Datei nicht geprueft -- nur ihre Typen wurden importiert.
 * Dabei haengen zwei Dinge daran, die man nicht annehmen darf: dass auf einem
 * geteilten Telefon niemand die Daten der vorigen Kraft sieht, und dass eine
 * Zeitfolge in der Reihenfolge ankommt, in der sie getippt wurde.
 *
 * Nachgemessen gefunden und hier festgehalten: `clearOfflineData()` loeschte
 * nichts. Jede Operation liess ihre Verbindung offen, eine offene Verbindung
 * blockiert `deleteDatabase`, und der blockierte Lauf wurde als Erfolg
 * behandelt. Der Einsatzplan der vorigen Kraft -- mit Adressen,
 * Zugangshinweisen und Ansprechpartnern -- blieb nach dem Abmelden liegen.
 */
const time = (id: string, action: TimeOperation['action'], clientTime: string, over: Partial<TimeOperation> = {}): TimeOperation => ({
  id,
  userId: 'anna',
  kind: 'time',
  action,
  jobId: 'job-1',
  clientTime,
  attempts: 0,
  ...over,
});

const photo = (id: string, over: Partial<QueuedPhoto> = {}): QueuedPhoto => ({
  id,
  userId: 'anna',
  jobId: 'job-1',
  clientUploadId: `upload-${id}`,
  category: 'AFTER',
  description: null,
  checklistItemId: null,
  fileName: `${id}.jpg`,
  contentType: 'image/jpeg',
  size: 3,
  clientTime: '2026-10-01T10:00:00.000Z',
  status: 'pending',
  attempts: 0,
  ...over,
});

beforeEach(() => {
  // Jeder Test beginnt mit einem leeren Geraet.
  globalThis.indexedDB = new IDBFactory();
});

describe('lokaler Speicher der Mitarbeiter-App', () => {
  it('gibt den Einsatzplan nur der Kraft zurueck, fuer die er geholt wurde', async () => {
    await saveSnapshot({ userId: 'anna', cachedAt: '2026-10-01T06:00:00.000Z', jobs: [] });
    expect(await readSnapshot('anna')).not.toBeNull();
    // Dasselbe Telefon, anderes Konto: kein Blick in den fremden Plan.
    expect(await readSnapshot('bernd')).toBeNull();
  });

  it('loescht beim Abmelden wirklich alles', async () => {
    await saveSnapshot({ userId: 'anna', cachedAt: '2026-10-01T06:00:00.000Z', jobs: [] });
    await enqueue(time('a', 'start', '2026-10-01T07:00:00.000Z'));
    await savePhoto(photo('p1'), new Blob(['abc']));

    await clearOfflineData();

    expect(await readSnapshot('anna')).toBeNull();
    expect(await listQueue('anna')).toEqual([]);
    expect(await listPhotos('anna')).toEqual([]);
    expect(await readPhotoBlob('p1')).toBeNull();
  });

  it('liefert die Warteschlange nach Tippzeitpunkt, nicht nach Schluessel', async () => {
    // Bewusst verdreht abgelegt: die Schluessel sind UUIDs, IndexedDB liefert
    // nach Schluessel. Ohne Sortierung kaeme der Feierabend vor dem Start.
    await enqueue(time('zzz', 'stop', '2026-10-01T15:00:00.000Z'));
    await enqueue(time('aaa', 'start', '2026-10-01T07:00:00.000Z'));
    await enqueue(time('mmm', 'resume', '2026-10-01T12:30:00.000Z'));
    await enqueue(time('bbb', 'pause', '2026-10-01T12:00:00.000Z'));

    const queue = await listQueue('anna');
    expect(queue.every((operation) => operation.kind === 'time')).toBe(true);
    expect((queue as TimeOperation[]).map((operation) => operation.action)).toEqual([
      'start',
      'pause',
      'resume',
      'stop',
    ]);
  });

  it('schickt keine Buchung einer anderen Kraft mit', async () => {
    await enqueue(time('mine', 'start', '2026-10-01T07:00:00.000Z'));
    await enqueue(time('theirs', 'start', '2026-10-01T07:01:00.000Z', { userId: 'bernd' }));

    expect((await listQueue('anna')).map((operation) => operation.id)).toEqual(['mine']);
    expect((await listQueue('bernd')).map((operation) => operation.id)).toEqual(['theirs']);
  });

  it('zeigt je Einsatz nur dessen eigene Buchungen', async () => {
    await enqueue(time('a', 'start', '2026-10-01T07:00:00.000Z', { jobId: 'job-1' }));
    await enqueue(time('b', 'start', '2026-10-01T08:00:00.000Z', { jobId: 'job-2' }));
    expect((await listQueuedTime('anna', 'job-1')).map((operation) => operation.id)).toEqual(['a']);
    expect((await listQueuedTime('bernd', 'job-1'))).toEqual([]);
  });

  it('zaehlt einen Fehlversuch, ohne die Buchung zu verlieren', async () => {
    await enqueue(time('a', 'start', '2026-10-01T07:00:00.000Z'));
    await markAttempt(time('a', 'start', '2026-10-01T07:00:00.000Z'), 'Verbindung verloren');

    const queue = await listQueue('anna');
    expect(queue).toHaveLength(1);
    expect(queue[0]!.attempts).toBe(1);
    expect(queue[0]!.lastError).toBe('Verbindung verloren');
    // Und der Tippzeitpunkt bleibt: er *ist* die erfasste Zeit.
    expect(queue[0]!.clientTime).toBe('2026-10-01T07:00:00.000Z');
  });

  it('belebt eine Buchung nicht wieder, die schon zugestellt und entfernt ist', async () => {
    /*
      Nachgemessen in einem echten Chromium, zwei Laschen derselben App:
      Lasche A sendet die Pause, der Server bucht sie, die Antwort geht beim
      Wechsel von Mobilfunk auf WLAN verloren. Lasche B raeumt dieselbe
      Warteschlange auf und entfernt die Pause. Erst danach laeuft Lasche A in
      ihren Zeitablauf und vermerkt den Fehlversuch.

      `markAttempt` war ein `put` und hat die erledigte Buchung damit wieder
      angelegt. Danach schlug sie bei jedem Versuch fehl, denn eine beendete
      Buchung wird nie wieder offen -- und weil runSync nach einem Fehlschlag
      jede weitere Buchung desselben Einsatzes zurueckhaelt, kam auch die
      naechste Schicht an diesem Einsatz nie mehr durch.

      Der ganze Weg steht in e2e/offline/field-offline.spec.ts; hier steht die
      Stelle, an der es entschieden wird.
    */
    const operation = time('a', 'pause', '2026-10-01T08:00:00.000Z');
    await enqueue(operation);
    await dequeue('a');

    await markAttempt(operation, 'Verbindung abgebrochen');

    expect(await listQueue('anna')).toEqual([]);
  });

  it('nimmt eine zugestellte Buchung aus der Warteschlange', async () => {
    await enqueue(time('a', 'start', '2026-10-01T07:00:00.000Z'));
    await enqueue(time('b', 'stop', '2026-10-01T09:00:00.000Z'));
    await dequeue('a');
    expect((await listQueue('anna')).map((operation) => operation.id)).toEqual(['b']);
  });

  it('legt Bild und Eintrag getrennt ab und raeumt beides zusammen weg', async () => {
    await savePhoto(photo('p1'), new Blob(['abc']));
    expect((await listPhotos('anna')).map((entry) => entry.id)).toEqual(['p1']);
    const blob = await readPhotoBlob('p1');
    expect(blob).not.toBeNull();
    expect(await blob!.text()).toBe('abc');

    await removePhoto('p1');
    expect(await listPhotos('anna')).toEqual([]);
    // Sonst bliebe das Bild auf dem Geraet liegen, nachdem es angekommen ist.
    expect(await readPhotoBlob('p1')).toBeNull();
  });

  it('zeigt keine Aufnahme einer anderen Kraft', async () => {
    await savePhoto(photo('mine'), new Blob(['a']));
    await savePhoto(photo('theirs', { userId: 'bernd' }), new Blob(['b']));
    expect((await listPhotos('anna')).map((entry) => entry.id)).toEqual(['mine']);
  });

  it('behaelt noch nicht uebertragene Buchungen, wenn die Datenbank schon existiert', async () => {
    // Ein Versionssprung hat hier einmal alle Speicher neu angelegt und damit
    // genau die Buchungen weggeworfen, die der Server noch nicht hatte. Der
    // Beweis, dass das nicht zurueckkommt: nach einem Schreiben in einem
    // Speicher muss der Inhalt eines anderen noch stehen.
    await enqueue(time('a', 'start', '2026-10-01T07:00:00.000Z'));
    await savePhoto(photo('p1'), new Blob(['abc']));
    await saveSnapshot({ userId: 'anna', cachedAt: '2026-10-01T06:00:00.000Z', jobs: [] });

    expect(await listQueue('anna')).toHaveLength(1);
    expect(await listPhotos('anna')).toHaveLength(1);
    expect(await readSnapshot('anna')).not.toBeNull();
  });
});
