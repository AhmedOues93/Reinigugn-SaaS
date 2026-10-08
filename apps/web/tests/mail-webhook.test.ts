import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyResendSignature } from '@/lib/mail/webhook-signature';

/**
 * This check is the only thing between the public internet and a write, so it
 * is tested against forged, stale and malformed input rather than only the
 * happy path.
 */
const secret = `whsec_${Buffer.from('a-signing-secret-for-tests').toString('base64')}`;

function sign(id: string, timestamp: string, body: string, withSecret = secret) {
  const key = withSecret.slice('whsec_'.length);
  const digest = createHmac('sha256', Buffer.from(key, 'base64'))
    .update(`${id}.${timestamp}.${body}`)
    .digest('base64');
  return `v1,${digest}`;
}

const body = JSON.stringify({ type: 'email.delivered', data: { email_id: 'abc' } });
const now = 1_800_000_000_000;
const timestamp = String(Math.floor(now / 1000));

describe('Resend webhook signature', () => {
  it('accepts a correctly signed request', () => {
    const result = verifyResendSignature({
      secret,
      id: 'msg_1',
      timestamp,
      signatureHeader: sign('msg_1', timestamp, body),
      rawBody: body,
      now,
    });
    expect(result.ok).toBe(true);
  });

  it('rejects a request with no signature headers', () => {
    for (const missing of ['id', 'timestamp', 'signature'] as const) {
      const result = verifyResendSignature({
        secret,
        id: missing === 'id' ? null : 'msg_1',
        timestamp: missing === 'timestamp' ? null : timestamp,
        signatureHeader: missing === 'signature' ? null : sign('msg_1', timestamp, body),
        rawBody: body,
        now,
      });
      expect(result.ok, `missing ${missing} was accepted`).toBe(false);
    }
  });

  it('rejects a body that was altered after signing', () => {
    const tampered = JSON.stringify({ type: 'email.delivered', data: { email_id: 'someone-elses' } });
    const result = verifyResendSignature({
      secret,
      id: 'msg_1',
      timestamp,
      signatureHeader: sign('msg_1', timestamp, body),
      rawBody: tampered,
      now,
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a signature made with a different secret', () => {
    const other = `whsec_${Buffer.from('a-different-secret').toString('base64')}`;
    const result = verifyResendSignature({
      secret,
      id: 'msg_1',
      timestamp,
      signatureHeader: sign('msg_1', timestamp, body, other),
      rawBody: body,
      now,
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a replay of an old but validly signed delivery', () => {
    const old = String(Math.floor(now / 1000) - 10 * 60);
    const result = verifyResendSignature({
      secret,
      id: 'msg_1',
      timestamp: old,
      signatureHeader: sign('msg_1', old, body),
      rawBody: body,
      now,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/Toleranz/);
  });

  it('rejects a timestamp that is not a number', () => {
    const result = verifyResendSignature({
      secret,
      id: 'msg_1',
      timestamp: 'gestern',
      signatureHeader: sign('msg_1', 'gestern', body),
      rawBody: body,
      now,
    });
    expect(result.ok).toBe(false);
  });

  it('accepts when one of several offered signatures matches, for rotation', () => {
    const other = `whsec_${Buffer.from('the-previous-secret').toString('base64')}`;
    const header = `${sign('msg_1', timestamp, body, other)} ${sign('msg_1', timestamp, body)}`;
    const result = verifyResendSignature({
      secret,
      id: 'msg_1',
      timestamp,
      signatureHeader: header,
      rawBody: body,
      now,
    });
    expect(result.ok).toBe(true);
  });

  it('ignores signature versions it does not understand', () => {
    const result = verifyResendSignature({
      secret,
      id: 'msg_1',
      timestamp,
      signatureHeader: `v2,${'A'.repeat(44)}`,
      rawBody: body,
      now,
    });
    expect(result.ok).toBe(false);
  });
});
