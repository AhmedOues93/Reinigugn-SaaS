import { createHash, randomBytes } from 'crypto';

export const invitationCookieName = 'sauberwerk_invitation';

export type InvitationPreview = {
  email: string;
  first_name: string;
  last_name: string;
  role: 'OFFICE' | 'EMPLOYEE' | 'CUSTOMER';
  company_name: string;
  expires_at: string;
};

export function createInvitationToken() {
  return randomBytes(32).toString('base64url');
}

export function hashInvitationToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function invitationExpiresAt() {
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
}
