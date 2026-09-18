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
const DB_VERSION = 1;
const JOBS_STORE = 'jobs';
const QUEUE_STORE = 'queue';

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

/** One queued write. `id` is client-generated and is what makes a retry idempotent. */
export type QueuedOperation = {
  id: string;
  userId: string;
  kind: 'checklist';
  itemId: string;
  completed: boolean;
  clientTime: string;
  attempts: number;
  lastError?: string;
};

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      // A version bump starts clean rather than migrating an unknown layout.
      for (const name of Array.from(db.objectStoreNames)) db.deleteObjectStore(name);
      db.createObjectStore(JOBS_STORE, { keyPath: 'userId' });
      db.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
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

export async function listQueue(userId: string): Promise<QueuedOperation[]> {
  const all = (await tx<QueuedOperation[]>(QUEUE_STORE, 'readonly', (store) => store.getAll())) ?? [];
  return all.filter((operation) => operation.userId === userId);
}

export async function dequeue(id: string) {
  await tx(QUEUE_STORE, 'readwrite', (store) => store.delete(id));
}

export async function markAttempt(operation: QueuedOperation, error: string) {
  await enqueue({ ...operation, attempts: operation.attempts + 1, lastError: error });
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
