import nodemailer from 'nodemailer';
import { decideRecipient } from '@/lib/mail/guard';

/**
 * Outbound e-mail for transactional documents.
 *
 * Configured through SMTP_* environment variables, which works with any
 * provider that speaks SMTP (Postmark, Mailjet, SES, a company relay, or the
 * local Mailpit in development). When nothing is configured, the result says so
 * explicitly — callers record `NOT_CONFIGURED` and never report a delivery that
 * did not happen.
 */
export type MailResult = { status: 'SENT' | 'FAILED' | 'NOT_CONFIGURED'; detail: string };

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  replyTo?: string | null;
  attachments?: { filename: string; content: Uint8Array; contentType: string }[];
};

export function mailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.MAIL_FROM);
}

export async function sendMail(message: MailMessage): Promise<MailResult> {
  if (!mailConfigured()) {
    return { status: 'NOT_CONFIGURED', detail: 'Kein E-Mail-Versand konfiguriert (SMTP_HOST / MAIL_FROM fehlen).' };
  }
  // Non-production environments never mail a real recipient unannounced.
  const decision = decideRecipient(message.to, message.subject);
  if (decision.action === 'block') {
    return { status: 'FAILED', detail: `Nicht gesendet. ${decision.reason}` };
  }

  try {
    const port = Number(process.env.SMTP_PORT ?? 587);
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE === 'true' || port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? '' } : undefined,
    });
    const info = await transport.sendMail({
      from: process.env.MAIL_FROM,
      to: decision.to,
      replyTo: message.replyTo ?? undefined,
      subject: decision.subject,
      text: decision.notice ? `${decision.notice}\n\n${message.text}` : message.text,
      attachments: message.attachments?.map((attachment) => ({
        filename: attachment.filename,
        content: Buffer.from(attachment.content),
        contentType: attachment.contentType,
      })),
    });
    const redirected = decision.to === message.to ? '' : ` Umgeleitet an ${decision.to}.`;
    return {
      status: 'SENT',
      detail: `Angenommen vom Mailserver (${info.messageId ?? 'ohne ID'}).${redirected}`,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unbekannter Fehler';
    return { status: 'FAILED', detail: `Versand fehlgeschlagen: ${reason}`.slice(0, 900) };
  }
}
