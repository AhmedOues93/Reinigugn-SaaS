/**
 * Local store for the employee field app.
 *
 * Scope and privacy rules this file exists to enforce:
 *  - Everything is written under a record keyed by the signed-in user id, and a
 *    read for a different user returns nothing. Switching accounts on a shared
 *    phone therefore cannot surface the previous cleaner's work.
 *  - Only the employee's own assigned work is stored. No customer list, no
 *    pricing, no colleague's data, no admin view — the cache can only contain
 *    what the server already returned for this employee.
 *  - `clearOfflineData()` runs on sign-out and drops the whole database.
 *  - The schema carries a version; opening an older version discards it rather
 *    than trying to read a layout it does not understand.
 */
const DB_NAME = 'sauberwerk-employee';
const DB_VERSION = 2;
const JOBS_STORE = 'jobs';
const QUEUE_STORE = 'queue';
/** Was eine Aufnahme ausmacht, ohne das Bild selbst -- billig zu lesen. */
const PHOTOS_STORE = 'photos';
/** Das Bild. Getrennt, damit eine Statusliste keine Megabytes laedt. */
const BLOBS_STORE = 'photo-blobs';

export type CachedJob = {
  id: string;
  title: string;
  scheduled_date: string;
  planned_start_at: string | null;
  planned_end_at: string | null;
  status: string;
  employee_instructions: string | null;
  customerName: string | null;
  objectName: string | null;
  address: string | null;
  contactPerson: string | null;
  contactPhone: string | null;
  accessInstructions: string | null;
  cleaningInstructions: string | null;
  checklist: { id: string; title: string; instruction: string | null; is_required: boolean; completed_at: string | null }[];
};

export type CachedSnapshot = { userId: string; cachedAt: string; jobs: CachedJob[] };

/**
 * Eine Buchung in der Warteschlange.
 *
 * `id` ist auf dem Geraet erzeugt und macht einen erneuten Versuch harmlos.
 * `clientTime` ist der Moment, in dem getippt wurde -- beim Abhaken entscheidet
 * er ueber Konflikte, bei der Zeiterfassung ist er die erfasste Zeit selbst.
 *
 * Das Schema bleibt bei Version 1: eine neue Art kommt hinzu, keine
 * vorhandene aendert sich. Ein Versionssprung wuerde die Datenbank verwerfen
 * und damit genau die Buchungen loeschen, die noch nicht beim Server sind.
 */
type BaseOperation = {
  id: string;
  userId: string;
  clientTime: string;
  attempts: number;
  lastError?: string;
};

export type ChecklistOperation = BaseOperation & {
  kind: 'checklist';
  itemId: string;
  completed: boolean;
};

export type TimeAction = 'start' | 'pause' | 'resume' | 'stop';

export type TimeOperation = BaseOperation & {
  kind: 'time';
  action: TimeAction;
  jobId: string;
};

export type QueuedOperation = ChecklistOperation | TimeOperation;

export type PhotoStatus = 'pending' | 'uploading' | 'failed';

/**
 * Eine Aufnahme, die noch nicht beim Server ist.
 *
 * `clientUploadId` ist die Kennung, mit der der Server eine zweite Zustellung
 * erkennt. Sie wird einmal beim Aufnehmen erzeugt und ueberlebt jeden Versuch
 * und jeden App-Neustart -- andernfalls waere jeder Wiederholungsversuch ein
 * neues Foto.
 */
export type QueuedPhoto = {
  id: string;
  userId: string;
  jobId: string;
  clientUploadId: string;
  category: 'BEFORE' | 'AFTER' | 'DOCUMENTATION';
  description: string | null;
  checklistItemId: string | null;
  fileName: string;
  contentType: string;
  size: number;
  clientTime: string;
  status: PhotoStatus;
  attempts: number;
  lastError?: string;
};

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      /*
        Nur anlegen, was fehlt.

        Frueher hat ein Versionssprung hier alle Speicher geloescht und neu
        angelegt. Das war vertretbar, solange nur ein zwischengespeicherter
        Einsatzplan darin lag -- inzwischen liegen dort Buchungen und Fotos,
        die der Server noch nicht hat. Ein Versionssprung haette genau die
        weggeworfen, und zwar unbemerkt.
      */
      // Der Einsatzplan liegt je Nutzer, alles andere je Eintrag.
      if (!db.objectStoreNames.contains(JOBS_STORE)) db.createObjectStore(JOBS_STORE, { keyPath: 'userId' });
      if (!db.objectStoreNames.contains(QUEUE_STORE)) db.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(PHOTOS_STORE)) db.createObjectStore(PHOTOS_STORE, { keyPath: 'id' });
      // Die Bilder liegen unter ihrer id, ohne eigenen Schluesselpfad.
      if (!db.objectStoreNames.contains(BLOBS_STORE)) db.createObjectStore(BLOBS_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null);
        try {
          const request = run(db.transaction(store, mode).objectStore(store));
          request.onsuccess = () => resolve(request.result as T);
          request.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      }),
  );
}

export async function saveSnapshot(snapshot: CachedSnapshot) {
  await tx(JOBS_STORE, 'readwrite', (store) => store.put(snapshot));
}

/** Returns nothing for a different user, so a cache can never cross accounts. */
export async function readSnapshot(userId: string): Promise<CachedSnapshot | null> {
  const value = await tx<CachedSnapshot>(JOBS_STORE, 'readonly', (store) => store.get(userId));
  return value && value.userId === userId ? value : null;
}

export async function enqueue(operation: QueuedOperation) {
  await tx(QUEUE_STORE, 'readwrite', (store) => store.put(operation));
}

/**
 * Die Warteschlange dieses Nutzers, in der Reihenfolge, in der getippt wurde.
 *
 * Die Sortierung ist nicht Kosmetik: Start, Pause, Fortsetzen und Feierabend
 * ergeben nur in dieser Reihenfolge einen Sinn. IndexedDB liefert nach
 * Schluessel, und der Schluessel ist eine zufaellige UUID -- ohne Sortierung
 * kaeme der Feierabend vor dem Start beim Server an.
 */
export async function listQueue(userId: string): Promise<QueuedOperation[]> {
  const all = (await tx<QueuedOperation[]>(QUEUE_STORE, 'readonly', (store) => store.getAll())) ?? [];
  return all
    .filter((operation) => operation.userId === userId)
    .sort((a, b) => a.clientTime.localeCompare(b.clientTime));
}

/** Die noch nicht uebertragenen Zeitbuchungen eines Einsatzes. */
export async function listQueuedTime(userId: string, jobId: string): Promise<TimeOperation[]> {
  const queue = await listQueue(userId);
  return queue.filter((operation): operation is TimeOperation =>
    operation.kind === 'time' && operation.jobId === jobId,
  );
}

export async function dequeue(id: string) {
  await tx(QUEUE_STORE, 'readwrite', (store) => store.delete(id));
}

export async function markAttempt(operation: QueuedOperation, error: string) {
  await enqueue({ ...operation, attempts: operation.attempts + 1, lastError: error });
}

/**
 * Legt eine Aufnahme ab: Beschreibung und Bild getrennt.
 *
 * Erst das Bild, dann der Eintrag. Bricht es dazwischen ab, liegt ein Bild
 * ohne Eintrag herum -- das kostet Platz, aber es taeuscht niemandem eine
 * Aufnahme vor, die es nicht gibt. Umgekehrt waere ein Eintrag ohne Bild ein
 * Foto, das die Mitarbeiterin in der Liste sieht und das nie ankommt.
 */
export async function savePhoto(photo: QueuedPhoto, blob: Blob) {
  await tx(BLOBS_STORE, 'readwrite', (store) => store.put(blob, photo.id));
  await tx(PHOTOS_STORE, 'readwrite', (store) => store.put(photo));
}

export async function listPhotos(userId: string): Promise<QueuedPhoto[]> {
  const all = (await tx<QueuedPhoto[]>(PHOTOS_STORE, 'readonly', (store) => store.getAll())) ?? [];
  return all
    .filter((photo) => photo.userId === userId)
    .sort((a, b) => a.clientTime.localeCompare(b.clientTime));
}

export async function readPhotoBlob(id: string): Promise<Blob | null> {
  return (await tx<Blob>(BLOBS_STORE, 'readonly', (store) => store.get(id))) ?? null;
}

export async function updatePhoto(photo: QueuedPhoto) {
  await tx(PHOTOS_STORE, 'readwrite', (store) => store.put(photo));
}

/** Erst nach bestaetigter Speicherung: zuerst der Eintrag, dann das Bild. */
export async function removePhoto(id: string) {
  await tx(PHOTOS_STORE, 'readwrite', (store) => store.delete(id));
  await tx(BLOBS_STORE, 'readwrite', (store) => store.delete(id));
}

/**
 * Wie viel Platz das Geraet noch gibt.
 *
 * Nicht jeder Browser beantwortet das. Ohne Antwort wird nicht geraten,
 * sondern null zurueckgegeben -- der Aufrufer laesst die Aufnahme dann zu und
 * faengt stattdessen den Fehler beim Schreiben ab.
 */
export async function remainingStorageBytes(): Promise<number | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
  try {
    const { quota, usage } = await navigator.storage.estimate();
    if (typeof quota !== 'number' || typeof usage !== 'number') return null;
    return Math.max(0, quota - usage);
  } catch {
    return null;
  }
}

/** Called on sign-out and on a detected user change. */
export async function clearOfflineData() {
  await new Promise<void>((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve();
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
  if (typeof navigator !== 'undefined' && navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage('clear-caches');
  }
}
