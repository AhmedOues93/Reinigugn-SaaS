import { appUrl } from '@/lib/utils';

export type InvitationEmail = { to: string; companyName: string; firstName: string; role: 'OFFICE' | 'EMPLOYEE'; token: string };
export type InvitationDelivery = { delivered: boolean; developmentUrl?: string };

export interface TransactionalMailService {
  sendInvitation(input: InvitationEmail): Promise<InvitationDelivery>;
}

function invitationUrl(token: string) {
  return appUrl(`/einladung/start?token=${encodeURIComponent(token)}`);
}

export const mailService: TransactionalMailService = {
  async sendInvitation(input) {
    // A provider adapter can replace this implementation without changing the invitation workflow.
    if (process.env.NODE_ENV !== 'production') return { delivered: false, developmentUrl: invitationUrl(input.token) };
    return { delivered: false };
  },
};
