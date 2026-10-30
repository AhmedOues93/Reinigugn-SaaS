import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { logout } from '@/app/(auth)/actions';
import { AuthShell, type AuthVariant } from '@/components/auth-shell';
import { Button, ButtonLink } from '@/components/ui';
import { getCompanyAccessReason, getCurrentCompany } from '@/lib/auth';
import { t, type TranslationKey } from '@/lib/i18n';
import { currentLocale } from '@/lib/i18n-server';
import { landingPathForRole } from '@/lib/landing';

export const metadata: Metadata = { title: 'Zugang pausiert – ReinPlan' };
export const dynamic = 'force-dynamic';

/**
 * Wohin ein Betrieb ohne Zugang geleitet wird.
 *
 * Jede Rolle bekommt den Satz, der ihr weiterhilft: die Inhaberin den Weg zum
 * Abo, das Buero den Hinweis auf die Inhaberin, das Team und die Kunden den
 * Hinweis auf ihren Betrieb. Wer wieder Zugang hat, wird zurueckgeschickt.
 */
export default async function AccessPausedPage() {
  const { membership } = await getCurrentCompany();
  if (!membership) redirect('/onboarding');

  const { hasAccess, reason } = await getCompanyAccessReason(membership.company_id);
  if (hasAccess) redirect(landingPathForRole(membership.role));

  const locale = await currentLocale();
  const role = membership.role;
  const supportEmail = process.env.REINPLAN_SUPPORT_EMAIL?.trim() || null;

  let body: TranslationKey;
  if (role === 'OWNER') {
    body = reason === 'SUSPENDED' ? 'access.ownerSuspended'
      : reason === 'SUBSCRIPTION_ENDED' ? 'access.ownerSubscriptionEnded'
      : 'access.ownerTrialEnded';
  } else if (role === 'OFFICE') {
    body = 'access.officeBody';
  } else if (role === 'EMPLOYEE') {
    body = 'access.teamBody';
  } else {
    body = 'access.customerBody';
  }

  const variant: AuthVariant = role === 'EMPLOYEE' ? 'employee' : role === 'CUSTOMER' ? 'portal' : 'office';

  return (
    <AuthShell title={t(locale, 'access.pausedTitle')} description={t(locale, body)} locale={locale} variant={variant}>
      <div className="flex flex-col gap-3">
        {role === 'OWNER' && reason !== 'SUSPENDED' && (
          <ButtonLink href="/dashboard/abo" size="block">{t(locale, 'access.choosePlan')}</ButtonLink>
        )}
        {role === 'OWNER' && reason === 'SUSPENDED' && supportEmail && (
          <ButtonLink href={`mailto:${supportEmail}`} size="block">{t(locale, 'access.contact')}</ButtonLink>
        )}
        <form action={logout}>
          <Button type="submit" variant="outline" size="block">{t(locale, 'access.signOut')}</Button>
        </form>
      </div>
    </AuthShell>
  );
}
