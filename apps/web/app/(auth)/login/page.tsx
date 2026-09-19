import Link from 'next/link';
import { login } from '../actions';
import { AuthMessage } from '@/components/auth-message';
import { AuthFooterLink, AuthShell } from '@/components/auth-shell';
import { AuthField, AuthForm, AuthSubmit } from '@/components/auth-form';
import { t } from '@/lib/i18n';
import { currentLocale } from '@/lib/i18n-server';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const [{ error, message }, locale] = await Promise.all([searchParams, currentLocale()]);

  return (
    <AuthShell
      locale={locale}
      title={t(locale, 'auth.signInTitle')}
      description={t(locale, 'auth.signInSubtitle')}
      footer={
        <>
          {t(locale, 'auth.noAccount')} <AuthFooterLink href="/signup">{t(locale, 'auth.signUp')}</AuthFooterLink>
        </>
      }
    >
      <AuthForm action={login} locale={locale}>
        <AuthMessage error={error} message={message} />
        <AuthField name="email" type="email" rule="email" autoComplete="email" label={t(locale, 'auth.email')} locale={locale} />
        <AuthField
          name="password"
          type="password"
          rule="password"
          autoComplete="current-password"
          label={t(locale, 'auth.password')}
          locale={locale}
          labelAction={
            <Link
              href="/forgot-password"
              /* Inline beside the label, so it cannot be 44px tall without
                 pushing the field around; 24px is the accessible floor. */
              className="inline-flex min-h-6 items-center rounded-sm text-[13px] font-medium text-primary underline-offset-4 hover:underline"
            >
              {t(locale, 'auth.forgotLink')}
            </Link>
          }
        />
        <AuthSubmit pendingLabel={t(locale, 'auth.signingIn')}>{t(locale, 'auth.signIn')}</AuthSubmit>
      </AuthForm>
    </AuthShell>
  );
}
