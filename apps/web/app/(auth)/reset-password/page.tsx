import { updatePassword } from '../actions';
import { AuthMessage } from '@/components/auth-message';
import { AuthShell } from '@/components/auth-shell';
import { AuthField, AuthForm, AuthSubmit } from '@/components/auth-form';
import { t } from '@/lib/i18n';
import { currentLocale } from '@/lib/i18n-server';

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [{ error }, locale] = await Promise.all([searchParams, currentLocale()]);

  return (
    <AuthShell locale={locale} title={t(locale, 'auth.resetTitle')} description={t(locale, 'auth.resetSubtitle')}>
      <AuthForm action={updatePassword} locale={locale}>
        <AuthMessage error={error} />
        <AuthField
          name="password"
          type="password"
          rule="newPassword"
          autoComplete="new-password"
          label={t(locale, 'auth.newPassword')}
          locale={locale}
          labelAction={<span className="text-xs text-muted-foreground">{t(locale, 'auth.passwordHint')}</span>}
        />
        <AuthField
          name="password_confirmation"
          type="password"
          rule="newPassword"
          autoComplete="new-password"
          label="Neues Passwort wiederholen"
          locale={locale}
        />
        <AuthSubmit pendingLabel={t(locale, 'auth.working')}>{t(locale, 'auth.setPassword')}</AuthSubmit>
      </AuthForm>
    </AuthShell>
  );
}
