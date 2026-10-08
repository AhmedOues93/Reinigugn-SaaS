import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runSync } from '@/lib/offline/sync';
import type { ChecklistOperation, QueuedOperation, TimeOperation } from '@/lib/offline/store';

// The store talks to IndexedDB, which does not exist in the node test
// environment; the queue is mocked so the replay semantics can be asserted.
const queue: QueuedOperation[] = [];
vi.mock('@/lib/offline/store', () => ({
  listQueue: async (userId: string) => queue.filter((o) => o.userId === userId),
  dequeue: async (id: string) => {
    const index = queue.findIndex((o) => o.id === id);
    if (index >= 0) queue.splice(index, 1);
  },
  markAttempt: async (operation: QueuedOperation, error: string) => {
    const found = queue.find((o) => o.id === operation.id);
    if (found) {
      found.attempts += 1;
      found.lastError = error;
    }
  },
}));

const op = (id: string, over: Partial<ChecklistOperation> = {}): ChecklistOperation => ({
  id,
  userId: 'user-1',
  kind: 'checklist',
  itemId: `item-${id}`,
  completed: true,
  clientTime: '2026-09-18T08:00:00.000Z',
  attempts: 0,
  ...over,
});

beforeEach(() => {
  queue.length = 0;
});

describe('offline queue replay', () => {
  it('applies queued writes and empties the queue', async () => {
    queue.push(op('a'), op('b'));
    const result = await runSync('user-1', async () => ({ data: 'APPLIED', error: null }));
    expect(result).toEqual({ applied: 2, conflicted: 0, failed: 0, deferred: 0 });
    expect(queue).toHaveLength(0);
  });

  it('treats a replayed write as done rather than applying it twice', async () => {
    queue.push(op('a'));
    const call = vi.fn().mockResolvedValue({ data: 'ALREADY_APPLIED', error: null });
    const result = await runSync('user-1', call);
    // Counted as applied and dequeued: the server state already matches, so a
    // retry after a dropped connection is a no-op rather than a double write.
    expect(result.applied).toBe(1);
    expect(call).toHaveBeenCalledTimes(1);
    expect(queue).toHaveLength(0);
  });

  it('drops a stale write instead of overwriting newer server state', async () => {
    queue.push(op('a'));
    const result = await runSync('user-1', async () => ({ data: 'SERVER_NEWER', error: null }));
    expect(result).toEqual({ applied: 0, conflicted: 1, failed: 0, deferred: 0 });
    expect(queue).toHaveLength(0);
  });

  it('keeps a failed write queued and records the attempt', async () => {
    queue.push(op('a'));
    const result = await runSync('user-1', async () => ({ data: null, error: { message: 'offline' } }));
    expect(result).toEqual({ applied: 0, conflicted: 0, failed: 1, deferred: 0 });
    expect(queue).toHaveLength(1);
    expect(queue[0].attempts).toBe(1);
    expect(queue[0].lastError).toBe('offline');
  });

  it('retries a previously failed write on the next run', async () => {
    queue.push(op('a'));
    await runSync('user-1', async () => ({ data: null, error: { message: 'offline' } }));
    const second = await runSync('user-1', async () => ({ data: 'APPLIED', error: null }));
    expect(second.applied).toBe(1);
    expect(queue).toHaveLength(0);
  });

  it('never replays another user queued operations', async () => {
    queue.push(op('mine'), op('theirs', { userId: 'user-2' }));
    const call = vi.fn().mockResolvedValue({ data: 'APPLIED', error: null });
    await runSync('user-1', call);
    expect(call).toHaveBeenCalledTimes(1);
    expect(queue.map((o) => o.id)).toEqual(['theirs']);
  });

  it('carries the tap time so the server can judge the conflict', async () => {
    queue.push(op('a', { clientTime: '2026-09-18T06:30:00.000Z' }));
    const call = vi.fn().mockResolvedValue({ data: 'APPLIED', error: null });
    await runSync('user-1', call);
    expect(call.mock.calls[0][0].clientTime).toBe('2026-09-18T06:30:00.000Z');
  });
});

/*
 * Reihenfolge nach einem Fehlschlag.
 *
 * Eine Zeitfolge baut aufeinander auf. Vorher lief nach einem Fehlschlag die
 * naechste Buchung derselben Folge trotzdem los -- mit messbarem Schaden:
 * faellt nur das Fortsetzen aus, schliesst der Feierabend die noch offene
 * Pause auf den Feierabend, und aus einer halben Stunde Pause werden zwei
 * Stunden. Das nachtraegliche Fortsetzen findet dann keine laufende Buchung
 * mehr und bleibt fuer immer liegen.
 */
const timeOp = (id: string, action: TimeOperation['action'], clientTime: string, jobId = 'job-1'): TimeOperation => ({
  id,
  userId: 'user-1',
  kind: 'time',
  action,
  jobId,
  clientTime,
  attempts: 0,
});

describe('Reihenfolge der Warteschlange nach einem Fehlschlag', () => {
  it('versucht nach einem Fehlschlag keine weitere Buchung desselben Einsatzes', async () => {
    queue.push(
      timeOp('pause', 'pause', '2026-10-01T10:00:00.000Z'),
      timeOp('resume', 'resume', '2026-10-01T10:30:00.000Z'),
      timeOp('stop', 'stop', '2026-10-01T12:00:00.000Z'),
    );
    const call = vi.fn(async (operation: QueuedOperation) =>
      operation.id === 'resume'
        ? { data: null, error: { message: 'Verbindung verloren' } }
        : { data: 'APPLIED', error: null },
    );

    const result = await runSync('user-1', call);

    // Der Feierabend wurde gar nicht geschickt — sonst haette er die offene
    // Pause auf 12:00 geschlossen.
    expect(call.mock.calls.map(([operation]) => operation.id)).toEqual(['pause', 'resume']);
    expect(result).toEqual({ applied: 1, conflicted: 0, failed: 1, deferred: 1 });
    // Beide liegen noch in der richtigen Reihenfolge in der Warteschlange.
    expect(queue.map((operation) => operation.id)).toEqual(['resume', 'stop']);
  });

  it('haelt nur den betroffenen Einsatz auf, nicht die ganze Warteschlange', async () => {
    queue.push(
      timeOp('a-start', 'start', '2026-10-01T07:00:00.000Z', 'job-1'),
      timeOp('b-start', 'start', '2026-10-01T07:05:00.000Z', 'job-2'),
      timeOp('a-stop', 'stop', '2026-10-01T09:00:00.000Z', 'job-1'),
      timeOp('b-stop', 'stop', '2026-10-01T09:05:00.000Z', 'job-2'),
    );
    const call = vi.fn(async (operation: QueuedOperation) =>
      operation.id === 'a-start'
        ? { data: null, error: { message: 'Verbindung verloren' } }
        : { data: 'APPLIED', error: null },
    );

    const result = await runSync('user-1', call);

    expect(call.mock.calls.map(([operation]) => operation.id)).toEqual(['a-start', 'b-start', 'b-stop']);
    expect(result).toEqual({ applied: 2, conflicted: 0, failed: 1, deferred: 1 });
    expect(queue.map((operation) => operation.id)).toEqual(['a-start', 'a-stop']);
  });

  it('spielt die liegengebliebene Folge beim naechsten Lauf vollstaendig ab', async () => {
    queue.push(
      timeOp('resume', 'resume', '2026-10-01T10:30:00.000Z'),
      timeOp('stop', 'stop', '2026-10-01T12:00:00.000Z'),
    );
    await runSync('user-1', async () => ({ data: null, error: { message: 'offline' } }));
    expect(queue).toHaveLength(2);

    const second = await runSync('user-1', async () => ({ data: 'APPLIED', error: null }));
    expect(second).toEqual({ applied: 2, conflicted: 0, failed: 0, deferred: 0 });
    expect(queue).toHaveLength(0);
  });

  it('laesst eine Checkliste weiterlaufen: dort gilt der absolute Zustand', async () => {
    // Abhaken setzt einen Zustand, es baut nicht auf dem vorigen auf. Eine
    // haengende Checklistenbuchung darf die naechste nicht aufhalten.
    queue.push(op('first'), op('second'));
    const call = vi.fn(async (operation: QueuedOperation) =>
      operation.id === 'first'
        ? { data: null, error: { message: 'offline' } }
        : { data: 'APPLIED', error: null },
    );
    const result = await runSync('user-1', call);
    expect(call).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ applied: 1, conflicted: 0, failed: 1, deferred: 0 });
  });
});
