import { appEnvironment, isProduction } from '@/lib/env';

/**
 * Keeps non-production environments from e-mailing real people.
 *
 * Staging runs against staging data, but that data is copied from, or typed to
 * look like, the real thing: a customer row carries a real billing address and
 * a real mailbox. An invoice test on staging must not put a document in a real
 * customer's inbox, and a stray payment reminder is worse.
 *
 * Three rules, in order:
 *
 * 1. Production sends exactly what it was given.
 * 2. Local development sends unchanged — Mailpit accepts every address and
 *    nothing leaves the machine — with the environment named in the subject so
 *    a screenshot is never mistaken for a real message.
 * 3. Staging sends only to addresses on the allow list. Anything else is
 *    redirected to the catch-all mailbox, keeping the flow testable while the
 *    real recipient is only ever named in the text. With no catch-all
 *    configured there is nowhere safe to put the message, so it is refused.
 *
 * Refusing is deliberate: a staging environment that silently mails customers
 * is a worse failure than one that cannot send at all.
 */

export type MailDecision =
  | { action: 'send'; to: string; subject: string; notice: string | null }
  | { action: 'block'; reason: string };

function allowList(): string[] {
  return (process.env.MAIL_ALLOWED_RECIPIENTS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

/** An entry matches a whole address (`qa@firma.de`) or a domain (`@firma.de`). */
function allowed(recipient: string, entries: string[]) {
  const address = recipient.trim().toLowerCase();
  return entries.some((entry) => (entry.startsWith('@') ? address.endsWith(entry) : address === entry));
}

export function decideRecipient(recipient: string, subject: string): MailDecision {
  if (isProduction()) return { action: 'send', to: recipient, subject, notice: null };

  const environment = appEnvironment();

  if (environment === 'local') {
    return { action: 'send', to: recipient, subject: `[LOKAL] ${subject}`, notice: null };
  }

  if (allowed(recipient, allowList())) {
    return { action: 'send', to: recipient, subject: `[STAGING] ${subject}`, notice: null };
  }

  const catchAll = process.env.MAIL_CATCH_ALL?.trim();
  if (catchAll) {
    return {
      action: 'send',
      to: catchAll,
      subject: `[STAGING → ${recipient}] ${subject}`,
      notice:
        `Diese Nachricht stammt aus der Staging-Umgebung und wurde umgeleitet. ` +
        `Eigentlicher Empfänger: ${recipient}.`,
    };
  }

  return {
    action: 'block',
    reason:
      `Staging darf nicht an ${recipient} senden. Setzen Sie MAIL_CATCH_ALL ` +
      `oder nehmen Sie die Adresse in MAIL_ALLOWED_RECIPIENTS auf.`,
  };
}
