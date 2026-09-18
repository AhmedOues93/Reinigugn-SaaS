import Link from 'next/link';
import { login } from '../actions';
import { AuthMessage } from '@/components/auth-message';
import { AuthFooterLink, AuthShell } from '@/components/auth-shell';
import { Button, Field, Input } from '@/components/ui';
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
      <form action={login} className="space-y-5">
        <AuthMessage error={error} message={message} />
        <Field label={t(locale, 'auth.email')} htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label={t(locale, 'auth.password')} htmlFor="password">
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </Field>
        <div className="flex justify-end">
          <Link
            href="/forgot-password"
            className="inline-flex min-h-touch items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {t(locale, 'auth.forgotLink')}
          </Link>
        </div>
        <Button size="block" type="submit">
          {t(locale, 'auth.signIn')}
        </Button>
      </form>
    </AuthShell>
  );
}
