import { decideRecipient } from '@/lib/mail/guard';
import { selectProvider, sender } from '@/lib/mail/provider';

/**
 * The one way a transactional message leaves the application.
 *
 * Everything funnels through here so the recipient guard, the provider choice
 * and the honesty rule are applied once rather than per feature:
 *
 * - nothing configured  → `NOT_CONFIGURED`, never a claimed delivery
 * - guard refuses       → `FAILED`, naming why
 * - provider refuses    → `FAILED`, carrying the provider's own reason
 * - provider accepts    → `SENT`, carrying the provider's message id
 *
 * "Accepted by the provider" is the strongest claim this layer can make.
 * Whether the mailbox at the far end took it is a later question, which is
 * what the Resend webhook route is for.
 */
export type MailResult = {
  status: 'SENT' | 'FAILED' | 'NOT_CONFIGURED';
  detail: string;
  provider: 'resend' | 'smtp' | null;
  providerMessageId: string | null;
};

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  replyTo?: string | null;
  attachments?: { filename: string; content: Uint8Array; contentType: string }[];
  /** Pass a stable value to make a retry safe. See `ProviderMessage`. */
  idempotencyKey?: string;
};

export function mailConfigured() {
  return Boolean(selectProvider() && process.env.MAIL_FROM);
}

/** Which provider is configured, for display and for the health endpoint. */
export function configuredProvider(): 'resend' | 'smtp' | null {
  return selectProvider()?.name ?? null;
}

export async function sendMail(message: MailMessage): Promise<MailResult> {
  const provider = selectProvider();
  const { from, replyTo } = sender();

  if (!provider || !from) {
    return {
      status: 'NOT_CONFIGURED',
      detail: 'Kein E-Mail-Versand konfiguriert (RESEND_API_KEY oder SMTP_HOST, und MAIL_FROM).',
      provider: null,
      providerMessageId: null,
    };
  }

  // Non-production environments never mail a real recipient unannounced.
  const decision = decideRecipient(message.to, message.subject);
  if (decision.action === 'block') {
    return {
      status: 'FAILED',
      detail: `Nicht gesendet. ${decision.reason}`,
      provider: provider.name,
      providerMessageId: null,
    };
  }

  const result = await provider.send({
    from,
    to: decision.to,
    subject: decision.subject,
    text: decision.notice ? `${decision.notice}\n\n${message.text}` : message.text,
    replyTo: message.replyTo ?? replyTo,
    attachments: message.attachments,
    idempotencyKey: message.idempotencyKey,
  });

  if (!result.ok) {
    return { status: 'FAILED', detail: result.detail, provider: provider.name, providerMessageId: null };
  }

  const redirected = decision.to === message.to ? '' : ` Umgeleitet an ${decision.to}.`;
  return {
    status: 'SENT',
    detail: `${result.detail}${redirected}`,
    provider: provider.name,
    providerMessageId: result.providerMessageId,
  };
}
