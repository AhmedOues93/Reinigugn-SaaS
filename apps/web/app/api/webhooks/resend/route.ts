import { createClient } from '@supabase/supabase-js';
import { supabaseUrl } from '@/lib/env';
import { verifyResendSignature } from '@/lib/mail/webhook-signature';

/**
 * Resend delivery events: delivered, bounced, complained, and the rest.
 *
 * Without this, an invoice reads as "sent" forever even when it hard-bounced,
 * and the office chases payment for a document nobody received.
 *
 * Three things make this safe to expose publicly:
 *
 * 1. **Authenticity.** Every request must carry a valid Svix signature over the
 *    raw body, within a five-minute window. An unsigned or stale request is
 *    rejected before anything is read.
 * 2. **Idempotency.** Providers retry. `record_mail_event` is keyed on the
 *    provider's own event id, so a replay returns the row already stored.
 * 3. **Least capability.** The route can call exactly one function, which can
 *    only append to a log.
 *
 * A note on the credential. This is the single place in the application that
 * uses a Supabase service-role key, and it is used only to invoke
 * `record_mail_event`, which is revoked from `anon` and `authenticated` so the
 * public API cannot be used to flood the table. Everything else in this
 * codebase runs on the publishable key under row-level security. The key is
 * read from a server-only name — never `NEXT_PUBLIC_` — so it cannot reach a
 * browser bundle, and this file is a route handler, which never ships to the
 * client.
 *
 * Both the signing secret and the key are optional: without them the endpoint
 * reports that it is not configured rather than accepting unverified writes.
 */

// The signature covers the raw bytes, so this must not run on a runtime that
// might transform the body.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ResendEvent = {
  type?: string;
  created_at?: string;
  data?: { email_id?: string; to?: string[] | string; created_at?: string };
};

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!secret || !serviceKey) {
    // Not an error the sender can fix, and not something to accept blindly.
    return Response.json({ error: 'webhook not configured' }, { status: 503 });
  }

  const rawBody = await request.text();
  const verification = verifyResendSignature({
    secret,
    id: request.headers.get('svix-id'),
    timestamp: request.headers.get('svix-timestamp'),
    signatureHeader: request.headers.get('svix-signature'),
    rawBody,
  });
  if (!verification.ok) {
    return Response.json({ error: 'invalid signature' }, { status: 401 });
  }

  let event: ResendEvent;
  try {
    event = JSON.parse(rawBody) as ResendEvent;
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 });
  }

  const eventId = request.headers.get('svix-id');
  const recipient = Array.isArray(event.data?.to) ? event.data?.to[0] : event.data?.to;
  const occurredAt = event.created_at ?? event.data?.created_at ?? null;

  const supabase = createClient(supabaseUrl(), serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await supabase.rpc('record_mail_event', {
    p_provider: 'resend',
    p_provider_event_id: eventId,
    p_provider_message_id: event.data?.email_id ?? null,
    p_event_type: event.type ?? 'unknown',
    p_recipient: recipient ?? null,
    p_occurred_at: occurredAt,
    p_payload: event as unknown as Record<string, unknown>,
  });

  if (error) {
    // Returning 500 asks the provider to retry, which is safe: the insert is
    // keyed on the event id, so a retry cannot duplicate anything.
    console.error('resend webhook: could not record event', error.message);
    return Response.json({ error: 'could not record event' }, { status: 500 });
  }

  return Response.json({ received: true });
}
