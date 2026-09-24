import { loginWithGoogle, signUp } from '../actions';
import { AuthMessage } from '@/components/auth-message';
import { AuthFooterLink, AuthShell } from '@/components/auth-shell';
import { AuthField, AuthForm, AuthSubmit } from '@/components/auth-form';
import { Building2, Lock, Mail, UserRound } from 'lucide-react';
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
      <form action={loginWithGoogle}>
        <input type="hidden" name="next" value="/onboarding" />
        <button type="submit" className="mb-5 flex min-h-12 w-full items-center justify-center gap-3 rounded-lg border border-border bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-highlight">
          <span aria-hidden="true" className="text-base font-bold">G</span>
          Mit Google registrieren
        </button>
      </form>
      <div className="mb-5 flex items-center gap-3 text-xs text-muted-foreground" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        <span>oder mit E-Mail</span>
        <span className="h-px flex-1 bg-border" />
      </div>
      <AuthForm action={signUp} locale={locale}>
        <AuthMessage error={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <AuthField name="first_name" rule="required" autoComplete="given-name" label="Vorname" locale={locale} icon={<UserRound />} />
          <AuthField name="last_name" rule="required" autoComplete="family-name" label="Nachname" locale={locale} icon={<UserRound />} />
        </div>
        <AuthField name="company_name" rule="required" autoComplete="organization" label="Firmenname" locale={locale} icon={<Building2 />} />
        <AuthField name="email" type="email" rule="email" autoComplete="email" label={t(locale, 'auth.email')} locale={locale} icon={<Mail />} />
        <AuthField
          name="password"
          type="password"
          rule="newPassword"
          autoComplete="new-password"
          label={t(locale, 'auth.password')}
          locale={locale}
          icon={<Lock />}
          labelAction={<span className="text-xs text-muted-foreground">{t(locale, 'auth.passwordHint')}</span>}
        />
        <AuthSubmit pendingLabel={t(locale, 'auth.working')}>{t(locale, 'auth.signUp')}</AuthSubmit>
      </AuthForm>
    </AuthShell>
  );
}
