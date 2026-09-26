import { cookies } from 'next/headers';
import {
  invitationCookieName,
  isInvitationState,
  type InvitationPreview,
  type InvitationState,
} from '@/lib/invitations';
import { createClient } from '@/lib/supabase/server';
import { InvitationAcceptButton, InvitationSignUp } from '@/components/invitation-acceptance';
import { AuthFooterLink, AuthShell } from '@/components/auth-shell';
import { Card } from '@/components/ui';
import { t, type TranslationKey } from '@/lib/i18n';
import { currentLocale } from '@/lib/i18n-server';

const roleKeys: Record<string, TranslationKey> = {
  OFFICE: 'role.OFFICE',
  EMPLOYEE: 'role.EMPLOYEE',
  CUSTOMER: 'role.CUSTOMER',
};

/**
 * What to say for a link that is not live.
 *
 * An accepted invitation is not a failure: the account was created and works.
 * Telling that person their link is "invalid, expired or already used" is both
 * unhelpful and slightly alarming, when all they need is the sign-in page.
 *
 * None of these reveal anything about the account beyond what the holder of
 * the link already knew.
 */
const stateCopy: Record<
  Exclude<InvitationState, 'GUELTIG'>,
  { title: TranslationKey; body: TranslationKey }
> = {
  ANGENOMMEN: { title: 'auth.inviteAccepted', body: 'auth.inviteAcceptedBody' },
  ABGELAUFEN: { title: 'auth.inviteExpired', body: 'auth.inviteExpiredBody' },
  ZURUECKGEZOGEN: { title: 'auth.inviteRevoked', body: 'auth.inviteRevokedBody' },
  UNBEKANNT: { title: 'auth.inviteUnavailable', body: 'auth.inviteUnavailableBody' },
};

export default async function InvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; state?: string }>;
}) {
  const [{ error, state }, locale] = await Promise.all([searchParams, currentLocale()]);
  const token = (await cookies()).get(invitationCookieName)?.value;

  const outcome = (
    isInvitationState(state) && state !== 'GUELTIG' ? state : 'UNBEKANNT'
  ) as Exclude<InvitationState, 'GUELTIG'>;
  const copy = stateCopy[outcome];

  const unavailable = (
    <AuthShell
      locale={locale}
      title={t(locale, copy.title)}
      description={t(locale, copy.body)}
      footer={<AuthFooterLink href="/login">{t(locale, 'auth.toSignIn')}</AuthFooterLink>}
    >
      <div />
    </AuthShell>
  );
  if (!token || error || (isInvitationState(state) && state !== 'GUELTIG')) return unavailable;

  const supabase = await createClient();
  const [{ data }, { data: { user } }] = await Promise.all([
    supabase.rpc('get_invitation_preview', { p_token: token }).maybeSingle(),
    supabase.auth.getUser(),
  ]);
  const preview = data as InvitationPreview | null;
  if (!preview) return unavailable;

  const name = `${preview.first_name} ${preview.last_name}`.trim();
  const roleLabel = t(locale, roleKeys[preview.role] ?? 'role.EMPLOYEE');
  const emailMatches = user?.email?.toLocaleLowerCase() === preview.email.toLocaleLowerCase();

  return (
    <AuthShell
      locale={locale}
      title={t(locale, 'auth.inviteWelcome', { name })}
      description={t(locale, 'auth.inviteBody', { role: roleLabel, company: preview.company_name })}
    >
      <Card className="mb-6 bg-muted/60 p-4 shadow-none">
        <p className="text-xs text-muted-foreground">{t(locale, 'auth.inviteEmailLabel')}</p>
        <p className="break-anywhere mt-1 font-medium">{preview.email}</p>
      </Card>

      {user && emailMatches ? (
        <InvitationAcceptButton locale={locale} />
      ) : user ? (
        <p role="alert" className="rounded-md bg-danger-soft p-3 text-sm leading-6 text-danger">
          {t(locale, 'auth.inviteWrongUser', { email: preview.email })}
        </p>
      ) : (
        <InvitationSignUp locale={locale} />
      )}
    </AuthShell>
  );
}
