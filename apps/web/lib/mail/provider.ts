import nodemailer from 'nodemailer';

/**
 * How a message actually leaves the building.
 *
 * Two adapters behind one interface. Local development keeps SMTP, because
 * Mailpit accepts everything and nothing leaves the machine. Staging and
 * production use Resend over HTTPS: no SMTP port to open, per-message IDs to
 * correlate with the provider's dashboard, and an idempotency key so a retried
 * request cannot deliver twice.
 *
 * Selection is by configuration, not by environment, so a developer can point
 * at Resend to test the real path and a self-hosted deployment can stay on a
 * company relay. `RESEND_API_KEY` wins when both are present.
 */

export type ProviderMessage = {
  from: string;
  to: string;
  subject: string;
  text: string;
  replyTo?: string | null;
  attachments?: { filename: string; content: Uint8Array; contentType: string }[];
  /**
   * Makes a retry safe: the provider must deliver at most one message per key.
   * Resend honours this natively; SMTP has no equivalent, which is why the
   * application also guards at the database (see `record_invoice_delivery`).
   */
  idempotencyKey?: string;
};

export type ProviderResult =
  | { ok: true; providerMessageId: string | null; detail: string }
  | { ok: false; detail: string };

export interface MailProvider {
  readonly name: 'resend' | 'smtp';
  send(message: ProviderMessage): Promise<ProviderResult>;
}

function toBase64(bytes: Uint8Array) {
  return Buffer.from(bytes).toString('base64');
}

/**
 * Resend's REST API. Chosen for staging because it needs only an outbound
 * HTTPS request, which every serverless host allows, where SMTP ports are
 * frequently blocked.
 */
export function resendProvider(apiKey: string): MailProvider {
  return {
    name: 'resend',
    async send(message) {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      };
      if (message.idempotencyKey) headers['Idempotency-Key'] = message.idempotencyKey;

      let response: Response;
      try {
        response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            from: message.from,
            to: [message.to],
            subject: message.subject,
            text: message.text,
            ...(message.replyTo ? { reply_to: message.replyTo } : {}),
            ...(message.attachments?.length
              ? {
                  attachments: message.attachments.map((attachment) => ({
                    filename: attachment.filename,
                    content: toBase64(attachment.content),
                    content_type: attachment.contentType,
                  })),
                }
              : {}),
          }),
        });
      } catch (error) {
        // A network failure is not a delivery. Say so rather than guessing.
        const reason = error instanceof Error ? error.message : 'Unbekannter Netzwerkfehler';
        return { ok: false, detail: `Resend nicht erreichbar: ${reason}`.slice(0, 900) };
      }

      const body = (await response.json().catch(() => null)) as
        | { id?: string; message?: string; name?: string }
        | null;

      if (!response.ok) {
        const reason = body?.message ?? body?.name ?? `HTTP ${response.status}`;
        return { ok: false, detail: `Resend hat abgelehnt: ${reason}`.slice(0, 900) };
      }
      return {
        ok: true,
        providerMessageId: body?.id ?? null,
        detail: `Von Resend angenommen${body?.id ? ` (${body.id})` : ''}.`,
      };
    },
  };
}

/** Any SMTP server, including the Mailpit that `supabase start` runs locally. */
export function smtpProvider(): MailProvider {
  return {
    name: 'smtp',
    async send(message) {
      try {
        const port = Number(process.env.SMTP_PORT ?? 587);
        const transport = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port,
          secure: process.env.SMTP_SECURE === 'true' || port === 465,
          auth: process.env.SMTP_USER
            ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? '' }
            : undefined,
        });
        const info = await transport.sendMail({
          from: message.from,
          to: message.to,
          replyTo: message.replyTo ?? undefined,
          subject: message.subject,
          text: message.text,
          attachments: message.attachments?.map((attachment) => ({
            filename: attachment.filename,
            content: Buffer.from(attachment.content),
            contentType: attachment.contentType,
          })),
        });
        return {
          ok: true,
          providerMessageId: info.messageId ?? null,
          detail: `Angenommen vom Mailserver${info.messageId ? ` (${info.messageId})` : ''}.`,
        };
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Unbekannter Fehler';
        return { ok: false, detail: `Versand fehlgeschlagen: ${reason}`.slice(0, 900) };
      }
    },
  };
}

/** The configured provider, or null when sending is switched off. */
export function selectProvider(): MailProvider | null {
  const resendKey = process.env.RESEND_API_KEY?.trim();
  if (resendKey) return resendProvider(resendKey);
  if (process.env.SMTP_HOST) return smtpProvider();
  return null;
}

/** The address messages are sent from, and where replies should go. */
export function sender() {
  return { from: process.env.MAIL_FROM?.trim() ?? '', replyTo: process.env.MAIL_REPLY_TO?.trim() || null };
}
