import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runSync } from '@/lib/offline/sync';
import type { QueuedOperation } from '@/lib/offline/store';

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

const op = (id: string, over: Partial<QueuedOperation> = {}): QueuedOperation => ({
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
    expect(result).toEqual({ applied: 2, conflicted: 0, failed: 0 });
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
    expect(result).toEqual({ applied: 0, conflicted: 1, failed: 0 });
    expect(queue).toHaveLength(0);
  });

  it('keeps a failed write queued and records the attempt', async () => {
    queue.push(op('a'));
    const result = await runSync('user-1', async () => ({ data: null, error: { message: 'offline' } }));
    expect(result).toEqual({ applied: 0, conflicted: 0, failed: 1 });
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
