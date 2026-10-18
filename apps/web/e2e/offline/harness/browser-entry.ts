/**
 * Was im Browser unter `window` liegt, wenn der Lauf beginnt.
 *
 * Es ist derselbe Code, den die Mitarbeiter-App ausliefert -- `lib/offline`
 * wird hier importiert, nicht nachgebaut. Das ist der Zweck der Uebung: die
 * Warteschlange gegen eine echte IndexedDB laufen zu lassen und nicht gegen
 * einen Ersatz.
 */
import * as store from '@/lib/offline/store';
import { runSync, type SyncOutcome } from '@/lib/offline/sync';
import { makeTimeServer, type TimeServer } from './time-server';

declare global {
  interface Window {
    Offline: typeof store;
    makeTimeServer: typeof makeTimeServer;
    /** Spielt die Warteschlange gegen diesen Server ab. */
    syncWith: (server: TimeServer, userId: string) => Promise<SyncOutcome>;
    /**
     * Direkt, fuer den Fall mit zwei Laschen: dort liegt der Server in Node
     * und wird von beiden Seiten ueber eine Bruecke gerufen, weil ein Server
     * je Lasche genau den geteilten Zustand verfehlen wuerde, um den es geht.
     */
    runSync: typeof runSync;
  }
}

window.Offline = store;
window.makeTimeServer = makeTimeServer;
window.runSync = runSync;

/**
 * Reicht `runSync` genau die Form herein, die der Provider aus
 * `supabase.rpc()` baut: ein Fehler wird zu `{ data: null, error }`, ein
 * Erfolg zu `{ data: 'APPLIED', error: null }`.
 */
window.syncWith = (server, userId) =>
  runSync(userId, async (operation) => {
    if (operation.kind !== 'time') return { data: 'APPLIED', error: null };
    try {
      server.call(userId, operation.action, operation.jobId, operation.clientTime);
      return { data: 'APPLIED', error: null };
    } catch (error) {
      return { data: null, error: { message: error instanceof Error ? error.message : 'unbekannt' } };
    }
  });
