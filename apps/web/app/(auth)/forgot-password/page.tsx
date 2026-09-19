import { requestPasswordReset } from '../actions';
import { AuthMessage } from '@/components/auth-message';
import { AuthFooterLink, AuthShell } from '@/components/auth-shell';
import { AuthField, AuthForm, AuthSubmit } from '@/components/auth-form';
import { t } from '@/lib/i18n';
import { currentLocale } from '@/lib/i18n-server';

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const [{ error, message }, locale] = await Promise.all([searchParams, currentLocale()]);

  return (
    <AuthShell
      locale={locale}
      title={t(locale, 'auth.forgotTitle')}
      description={t(locale, 'auth.forgotSubtitle')}
      footer={<AuthFooterLink href="/login">{t(locale, 'auth.backToSignIn')}</AuthFooterLink>}
    >
      <AuthForm action={requestPasswordReset} locale={locale}>
        <AuthMessage error={error} message={message} />
        <AuthField name="email" type="email" rule="email" autoComplete="email" label={t(locale, 'auth.email')} locale={locale} />
        <AuthSubmit pendingLabel={t(locale, 'auth.working')}>{t(locale, 'auth.sendLink')}</AuthSubmit>
      </AuthForm>
    </AuthShell>
  );
}
