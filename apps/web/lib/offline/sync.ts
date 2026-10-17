import { dequeue, listQueue, markAttempt, type QueuedOperation } from '@/lib/offline/store';

export type SyncOutcome = {
  applied: number;
  conflicted: number;
  failed: number;
  /**
   * Buchungen, die nicht einmal versucht wurden, weil eine fruehere Buchung
   * desselben Einsatzes fehlgeschlagen ist. Sie bleiben in der Warteschlange
   * und kommen beim naechsten Lauf in der richtigen Reihenfolge dran.
   */
  deferred: number;
};

/**
 * Replays the queue against the server.
 *
 * Idempotency: `sync_my_checklist_item` sets an absolute state rather than
 * toggling, and reports `ALREADY_APPLIED` when the row already matches. A retry
 * after a dropped connection therefore cannot double-apply, and the operation is
 * removed from the queue in that case just as if it had applied now. Die
 * Zeitfunktionen erkennen eine zweite Zustellung am uebermittelten Zeitpunkt
 * und geben die vorhandene Buchung zurueck.
 *
 * Conflict: the queued write carries the moment the cleaner tapped. If the
 * server row changed after that, the function answers `SERVER_NEWER`, the newer
 * server state is kept and the queued write is dropped rather than silently
 * overwriting the office. The caller surfaces that to the employee.
 *
 * Authorisation is unchanged: the RPC delegates to the existing employee-scoped
 * function, so the offline path is not a way around the assignment check.
 *
 * Reihenfolge: `listQueue` liefert nach Tippzeitpunkt sortiert, und eine
 * Zeitfolge (Start, Pause, Fortsetzen, Feierabend) baut aufeinander auf.
 * Darum wird nach einem Fehlschlag keine weitere Buchung *desselben
 * Einsatzes* mehr versucht.
 *
 * Nachgemessen, warum das noetig ist: Pause 10:00, Fortsetzen 10:30,
 * Feierabend 12:00. Schlaegt nur das Fortsetzen fehl, lief vorher der
 * Feierabend trotzdem durch -- und der schliesst eine noch offene Pause auf
 * den Feierabend. Aus 30 Minuten Pause wurden zwei Stunden, und das
 * nachtraegliche Fortsetzen fand keine laufende Buchung mehr und blieb fuer
 * immer in der Warteschlange. Eineinhalb Stunden bezahlte Zeit weg, ohne
 * Fehlermeldung an die Kraft.
 *
 * Buchungen anderer Einsaetze laufen weiter: sie haengen nicht an dieser
 * Folge, und eine Stoerung soll nicht die ganze Warteschlange anhalten.
 */
export async function runSync(
  userId: string,
  call: (operation: QueuedOperation) => Promise<{ data: string | null; error: { message: string } | null }>,
): Promise<SyncOutcome> {
  const queue = await listQueue(userId);
  const outcome: SyncOutcome = { applied: 0, conflicted: 0, failed: 0, deferred: 0 };
  /** Einsaetze, bei denen eine Buchung haengt. Alles Spaetere wartet. */
  const blocked = new Set<string>();

  for (const operation of queue) {
    if (operation.kind === 'time' && blocked.has(operation.jobId)) {
      outcome.deferred += 1;
      continue;
    }
    const { data, error } = await call(operation);
    if (error) {
      // Keep it queued and count the attempt; the next reconnect retries.
      await markAttempt(operation, error.message);
      outcome.failed += 1;
      if (operation.kind === 'time') blocked.add(operation.jobId);
      continue;
    }
    if (data === 'SERVER_NEWER') outcome.conflicted += 1;
    else outcome.applied += 1;
    await dequeue(operation.id);
  }
  return outcome;
}
