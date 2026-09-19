import { signUp } from '../actions';
import { AuthMessage } from '@/components/auth-message';
import { AuthFooterLink, AuthShell } from '@/components/auth-shell';
import { AuthField, AuthForm, AuthSubmit } from '@/components/auth-form';
import { t } from '@/lib/i18n';
import { currentLocale } from '@/lib/i18n-server';

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [{ error }, locale] = await Promise.all([searchParams, currentLocale()]);

  return (
    <AuthShell
      locale={locale}
      title={t(locale, 'auth.signUpTitle')}
      description={t(locale, 'auth.signUpSubtitle')}
      footer={
        <>
          {t(locale, 'auth.haveAccount')} <AuthFooterLink href="/login">{t(locale, 'auth.signIn')}</AuthFooterLink>
        </>
      }
    >
      <AuthForm action={signUp} locale={locale}>
        <AuthMessage error={error} />
        <AuthField name="email" type="email" rule="email" autoComplete="email" label={t(locale, 'auth.email')} locale={locale} />
        <AuthField
          name="password"
          type="password"
          rule="newPassword"
          autoComplete="new-password"
          label={t(locale, 'auth.password')}
          locale={locale}
          labelAction={<span className="text-xs text-muted-foreground">{t(locale, 'auth.passwordHint')}</span>}
        />
        <AuthSubmit pendingLabel={t(locale, 'auth.working')}>{t(locale, 'auth.signUp')}</AuthSubmit>
      </AuthForm>
    </AuthShell>
  );
}
