import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestError } from '../instrumentation';

afterEach(() => vi.restoreAllMocks());

describe('server error reporting', () => {
  it('reports route templates and correlation digest without customer data or credentials', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = Object.assign(new Error('Customer alice@example.com password=secret'), { digest: '12345' });
    await onRequestError(error,
      { path: '/dashboard/kunden/private-id?token=secret', method: 'POST', headers: { cookie: 'session=secret' } },
      { routerKind: 'App Router', routePath: '/dashboard/kunden/[id]', routeType: 'action', revalidateReason: undefined });
    const event = JSON.parse(log.mock.calls[0][0]);
    expect(event).toEqual({ event: 'reinplan.request_error', timestamp: expect.any(String), route: '/dashboard/kunden/[id]', type: 'action', digest: '12345' });
    expect(log.mock.calls[0][0]).not.toMatch(/alice|secret|private-id|stack|cookie/);
  });

  it('accepts arbitrary thrown values and drops malformed digests', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const error of [null, 'secret', { digest: 'alice@example.com' }]) {
      await onRequestError(error, { path: '/', method: 'GET', headers: {} },
        { routerKind: 'App Router', routePath: '/', routeType: 'render', revalidateReason: undefined });
    }
    for (const call of log.mock.calls) expect(JSON.parse(call[0])).not.toHaveProperty('digest');
  });
});
