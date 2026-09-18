import { signUp } from '../actions';
import { AuthMessage } from '@/components/auth-message';
import { AuthFooterLink, AuthShell } from '@/components/auth-shell';
import { Button, Field, Input } from '@/components/ui';
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
      <form action={signUp} className="space-y-5">
        <AuthMessage error={error} />
        <Field label={t(locale, 'auth.email')} htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label={t(locale, 'auth.password')} hint={t(locale, 'auth.passwordHint')} htmlFor="password">
          <Input id="password" name="password" type="password" autoComplete="new-password" minLength={12} required />
        </Field>
        <Button size="block" type="submit">
          {t(locale, 'auth.signUp')}
        </Button>
      </form>
    </AuthShell>
  );
}
