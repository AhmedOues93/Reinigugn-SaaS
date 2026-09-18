import { requestPasswordReset } from '../actions';
import { AuthMessage } from '@/components/auth-message';
import { AuthFooterLink, AuthShell } from '@/components/auth-shell';
import { Button, Field, Input } from '@/components/ui';
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
      <form action={requestPasswordReset} className="space-y-5">
        <AuthMessage error={error} message={message} />
        <Field label={t(locale, 'auth.email')} htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Button size="block" type="submit">
          {t(locale, 'auth.sendLink')}
        </Button>
      </form>
    </AuthShell>
  );
}
