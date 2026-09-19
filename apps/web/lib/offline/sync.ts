import { dequeue, listQueue, markAttempt, type QueuedOperation } from '@/lib/offline/store';

export type SyncOutcome = { applied: number; conflicted: number; failed: number };

/**
 * Replays the queue against the server.
 *
 * Idempotency: `sync_my_checklist_item` sets an absolute state rather than
 * toggling, and reports `ALREADY_APPLIED` when the row already matches. A retry
 * after a dropped connection therefore cannot double-apply, and the operation is
 * removed from the queue in that case just as if it had applied now.
 *
 * Conflict: the queued write carries the moment the cleaner tapped. If the
 * server row changed after that, the function answers `SERVER_NEWER`, the newer
 * server state is kept and the queued write is dropped rather than silently
 * overwriting the office. The caller surfaces that to the employee.
 *
 * Authorisation is unchanged: the RPC delegates to the existing employee-scoped
 * function, so the offline path is not a way around the assignment check.
 */
export async function runSync(
  userId: string,
  call: (operation: QueuedOperation) => Promise<{ data: string | null; error: { message: string } | null }>,
): Promise<SyncOutcome> {
  const queue = await listQueue(userId);
  const outcome: SyncOutcome = { applied: 0, conflicted: 0, failed: 0 };

  for (const operation of queue) {
    const { data, error } = await call(operation);
    if (error) {
      // Keep it queued and count the attempt; the next reconnect retries.
      await markAttempt(operation, error.message);
      outcome.failed += 1;
      continue;
    }
    if (data === 'SERVER_NEWER') outcome.conflicted += 1;
    else outcome.applied += 1;
    await dequeue(operation.id);
  }
  return outcome;
}
