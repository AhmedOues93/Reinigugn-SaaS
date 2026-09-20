import Link from 'next/link';
import { login } from '../actions';
import { AuthMessage } from '@/components/auth-message';
import { AuthFooterLink, AuthShell } from '@/components/auth-shell';
import { AuthField, AuthForm, AuthRemember, AuthSubmit } from '@/components/auth-form';
import { Lock, Mail } from 'lucide-react';
import { t } from '@/lib/i18n';
import { currentLocale } from '@/lib/i18n-server';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; app?: string }>;
}) {
  const [{ error, message, app }, locale] = await Promise.all([searchParams, currentLocale()]);

  /*
   * Who is signing in. Set when somebody is bounced out of the field app or the
   * portal, so they are greeted in their own terms instead of being sold an
   * office product. It changes wording and layout only — every account still
   * lands wherever its role belongs.
   */
  const variant = app === 'team' ? 'employee' : app === 'portal' ? 'portal' : 'office';

  return (
    <AuthShell
      locale={locale}
      variant={variant}
      title={t(locale, variant === 'office' ? 'auth.signInTitle' : 'auth.welcomeBack')}
      description={t(locale, variant === 'employee' ? 'auth.signInEmployee' : variant === 'portal' ? 'auth.signInPortal' : 'auth.signInSubtitle')}
      footer={
        variant === 'office' ? (
          <>
            {t(locale, 'auth.noAccount')} <AuthFooterLink href="/signup">{t(locale, 'auth.signUp')}</AuthFooterLink>
          </>
        ) : undefined
      }
    >
      <AuthForm action={login} locale={locale}>
        <AuthMessage error={error} message={message} />
        <AuthField
          name="email"
          type="email"
          rule="email"
          autoComplete="email"
          label={t(locale, 'auth.email')}
          locale={locale}
          icon={<Mail />}
          placeholder="max@firma.de"
        />
        <AuthField
          name="password"
          type="password"
          rule="password"
          autoComplete="current-password"
          label={t(locale, 'auth.password')}
          locale={locale}
          icon={<Lock />}
          labelAction={
            <Link
              href="/forgot-password"
              /* Inline beside the label, so it cannot be 44px tall without
                 pushing the field around; 24px is the accessible floor. */
              className="inline-flex min-h-6 items-center rounded-sm text-[13px] font-medium text-highlight underline-offset-4 hover:underline"
            >
              {t(locale, 'auth.forgotLink')}
            </Link>
          }
        />
        <AuthRemember label={t(locale, 'auth.remember')} />
        <AuthSubmit pendingLabel={t(locale, 'auth.signingIn')}>{t(locale, 'auth.signIn')}</AuthSubmit>
      </AuthForm>
    </AuthShell>
  );
}
