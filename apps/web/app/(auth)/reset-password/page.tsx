import { updatePassword } from '../actions';
import { AuthMessage } from '@/components/auth-message';
import { AuthShell } from '@/components/auth-shell';
import { Button, Field, Input } from '@/components/ui';
import { t } from '@/lib/i18n';
import { currentLocale } from '@/lib/i18n-server';

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [{ error }, locale] = await Promise.all([searchParams, currentLocale()]);

  return (
    <AuthShell locale={locale} title={t(locale, 'auth.resetTitle')} description={t(locale, 'auth.resetSubtitle')}>
      <form action={updatePassword} className="space-y-5">
        <AuthMessage error={error} />
        <Field label={t(locale, 'auth.newPassword')} hint={t(locale, 'auth.passwordHint')} htmlFor="password">
          <Input id="password" name="password" type="password" autoComplete="new-password" minLength={12} required />
        </Field>
        <Button size="block" type="submit">
          {t(locale, 'auth.setPassword')}
        </Button>
      </form>
    </AuthShell>
  );
}
