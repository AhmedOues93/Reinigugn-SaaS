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

/**
 * Why a link is not usable, which decides what the page says.
 *
 * ANGENOMMEN is the one that matters most in practice: the account exists and
 * works, and the person needs a sign-in prompt rather than an error.
 */
export type InvitationState =
  | 'GUELTIG'
  | 'ANGENOMMEN'
  | 'ABGELAUFEN'
  | 'ZURUECKGEZOGEN'
  | 'UNBEKANNT';

/** The five states that are not a live invitation, and what to say about each. */
export const spentInvitationStates: readonly InvitationState[] = [
  'ANGENOMMEN',
  'ABGELAUFEN',
  'ZURUECKGEZOGEN',
  'UNBEKANNT',
];

export function isInvitationState(value: string | undefined): value is InvitationState {
  return (
    value === 'GUELTIG' ||
    value === 'ANGENOMMEN' ||
    value === 'ABGELAUFEN' ||
    value === 'ZURUECKGEZOGEN' ||
    value === 'UNBEKANNT'
  );
}

export function createInvitationToken() {
  return randomBytes(32).toString('base64url');
}

export function hashInvitationToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function invitationExpiresAt() {
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
}
