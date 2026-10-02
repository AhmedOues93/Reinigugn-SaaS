import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verifies a Resend webhook signature.
 *
 * Resend signs with Svix, so each delivery carries `svix-id`,
 * `svix-timestamp` and `svix-signature`. The signed content is
 * `{id}.{timestamp}.{rawBody}`, HMAC-SHA256 with the secret, base64 encoded.
 * The secret arrives as `whsec_<base64>`; the bytes after the prefix are the
 * key, not the ASCII of the string.
 *
 * Implemented here rather than pulled in as a dependency because it is twenty
 * lines and the alternative is trusting an unaudited package with the one
 * check standing between the public internet and a write.
 *
 * Two properties matter and are easy to get wrong:
 *
 * - the comparison is constant time, so the signature cannot be guessed a byte
 *   at a time by measuring how long a rejection takes;
 * - the timestamp is checked, so a valid-but-old delivery cannot be captured
 *   and replayed indefinitely.
 */

const toleranceSeconds = 5 * 60;

export type VerificationResult = { ok: true } | { ok: false; reason: string };

export function verifyResendSignature({
  secret,
  id,
  timestamp,
  signatureHeader,
  rawBody,
  now = Date.now(),
}: {
  secret: string;
  id: string | null;
  timestamp: string | null;
  signatureHeader: string | null;
  rawBody: string;
  now?: number;
}): VerificationResult {
  if (!id || !timestamp || !signatureHeader) return { ok: false, reason: 'Signaturkopfzeilen fehlen.' };

  const sent = Number(timestamp);
  if (!Number.isFinite(sent)) return { ok: false, reason: 'Zeitstempel ist keine Zahl.' };
  if (Math.abs(now / 1000 - sent) > toleranceSeconds) {
    return { ok: false, reason: 'Zeitstempel außerhalb der Toleranz.' };
  }

  const key = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
  let expected: Buffer;
  try {
    expected = createHmac('sha256', Buffer.from(key, 'base64')).update(`${id}.${timestamp}.${rawBody}`).digest();
  } catch {
    return { ok: false, reason: 'Signaturschlüssel ist unlesbar.' };
  }

  // The header carries one or more space-separated `v1,<base64>` pairs, so a
  // secret can be rotated without dropping deliveries.
  for (const candidate of signatureHeader.split(' ')) {
    const [version, value] = candidate.split(',');
    if (version !== 'v1' || !value) continue;
    let given: Buffer;
    try {
      given = Buffer.from(value, 'base64');
    } catch {
      continue;
    }
    if (given.length === expected.length && timingSafeEqual(given, expected)) return { ok: true };
  }
  return { ok: false, reason: 'Keine passende Signatur.' };
}
