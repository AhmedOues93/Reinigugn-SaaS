import { appUrl } from '@/lib/utils';
import { appEnvironment } from '@/lib/env';
import { mailConfigured, sendMail } from '@/lib/mail/transport';

/**
 * Invitation e-mail for the three roles that can be invited into a company.
 *
 * This used to be a stub that never sent anything: staff read the link off the
 * screen and passed it on themselves. That is fine on a laptop and useless on
 * a deployed environment, where the person being invited is somewhere else.
 *
 * The link carries a single-use token, so the message is the credential.
 * `developmentUrl` is therefore returned only when nothing was sent — locally,
 * or when a provider is not configured — so the invitation can still be
 * completed by hand without anyone having to read a token out of a log.
 */
export type InvitationEmail = {
  to: string;
  companyName: string;
  firstName: string;
  role: 'OFFICE' | 'EMPLOYEE' | 'CUSTOMER';
  token: string;
};

export type InvitationDelivery = {
  delivered: boolean;
  /** Present only when nothing was sent, so staff can pass the link on. */
  developmentUrl?: string;
  detail?: string;
};

export interface TransactionalMailService {
  sendInvitation(input: InvitationEmail): Promise<InvitationDelivery>;
}

function invitationUrl(token: string) {
  return appUrl(`/einladung/start?token=${encodeURIComponent(token)}`);
}

const roleWording: Record<InvitationEmail['role'], { what: string; why: string }> = {
  OFFICE: {
    what: 'die Büroverwaltung',
    why: 'Damit planen Sie Einsätze, pflegen Kundendaten und schreiben Rechnungen.',
  },
  EMPLOYEE: {
    what: 'die Mitarbeiter-App',
    why: 'Dort sehen Sie Ihre Einsätze, erfassen Arbeitszeiten und dokumentieren die Reinigung.',
  },
  CUSTOMER: {
    what: 'das Kundenportal',
    why: 'Dort sehen Sie anstehende Termine, erledigte Leistungen und Ihre Rechnungen.',
  },
};

export const mailService: TransactionalMailService = {
  async sendInvitation(input) {
    const url = invitationUrl(input.token);
    const wording = roleWording[input.role];

    // Nothing configured: hand the link back rather than pretending to send.
    if (!mailConfigured()) {
      const local = appEnvironment() === 'local';
      return {
        delivered: false,
        developmentUrl: local ? url : undefined,
        detail: local
          ? 'Kein E-Mail-Versand eingerichtet — Link manuell weitergeben.'
          : 'E-Mail-Versand ist für diese Umgebung nicht eingerichtet.',
      };
    }

    const result = await sendMail({
      to: input.to,
      subject: `Ihr Zugang zu ${input.companyName}`,
      text:
        `Hallo ${input.firstName},\n\n` +
        `${input.companyName} hat Sie zu ${wording.what} eingeladen. ${wording.why}\n\n` +
        `Zugang einrichten:\n${url}\n\n` +
        `Der Link ist nur für Sie bestimmt und läuft nach einiger Zeit ab. ` +
        `Wenn Sie diese Einladung nicht erwartet haben, können Sie sie ignorieren.\n\n` +
        `Mit freundlichen Grüßen\n${input.companyName}`,
      // Two invitations to the same person are two different tokens, so the
      // token is what makes an attempt unique.
      idempotencyKey: `invite-${input.token.slice(0, 40)}`,
    });

    if (result.status === 'SENT') return { delivered: true, detail: result.detail };

    // A failure keeps the link reachable locally, where reading it off the
    // screen is a reasonable fallback. On a deployed environment it is not —
    // the address may not be one the sender controls — so only the reason
    // comes back.
    return {
      delivered: false,
      developmentUrl: appEnvironment() === 'local' ? url : undefined,
      detail: result.detail,
    };
  },
};
