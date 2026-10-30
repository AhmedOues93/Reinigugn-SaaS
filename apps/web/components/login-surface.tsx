import Link from 'next/link';
import { redirect } from 'next/navigation';
import { login, logout } from '@/app/(auth)/actions';
import { AuthMessage } from '@/components/auth-message';
import { AuthFooterLink, AuthShell, type AuthVariant } from '@/components/auth-shell';
import { AuthField, AuthForm, AuthRemember, AuthSubmit } from '@/components/auth-form';
import { Button, ButtonLink } from '@/components/ui';
import { Lock, Mail } from 'lucide-react';
import { currentSessionSummary } from '@/lib/auth';
import { t, type TranslationKey } from '@/lib/i18n';
import { currentLocale } from '@/lib/i18n-server';
import { landingPathForRole } from '@/lib/landing';
import { AuthCaptcha } from '@/components/auth-captcha';

/** Welche Rollen auf welche Anmeldeseite gehoeren. */
const rolesForVariant: Record<AuthVariant, readonly string[]> = {
  office: ['OWNER', 'OFFICE'],
  employee: ['EMPLOYEE'],
  portal: ['CUSTOMER'],
};

const roleKey: Record<string, TranslationKey> = {
  OWNER: 'role.OWNER',
  OFFICE: 'role.OFFICE',
  EMPLOYEE: 'role.EMPLOYEE',
  CUSTOMER: 'role.CUSTOMER',
};

export async function LoginSurface({
  variant,
  error,
  message,
}: {
  variant: AuthVariant;
  error?: string;
  message?: string;
}) {
  const locale = await currentLocale();
  const session = await currentSessionSummary();

  /*
   * Ein Browser haelt eine Sitzung. Wer als Buero angemeldet die
   * Mitarbeiter-App oeffnet, landete bisher kommentarlos im Buero. Jetzt:
   * passt die Rolle zur Seite, geht es direkt weiter; passt sie nicht, sagt
   * die Seite, mit welchem Konto man unterwegs ist, und bietet den Wechsel an.
   */
  if (session?.role && rolesForVariant[variant].includes(session.role)) {
    redirect(landingPathForRole(session.role));
  }
  // Angemeldet, aber noch ohne Betrieb: das ist die Einrichtung, keine Anmeldung.
  if (session && !session.role && variant === 'office') redirect('/onboarding');

  const description = t(locale, variant === 'employee' ? 'auth.signInEmployee' : variant === 'portal' ? 'auth.signInPortal' : 'auth.signInSubtitle');

  if (session) {
    const roleLabel = session.role ? t(locale, roleKey[session.role] ?? session.role) : '—';
    return (
      <AuthShell locale={locale} variant={variant} title={t(locale, 'auth.otherAccountTitle')} description={description}>
        <div className="space-y-4">
          <p className="rounded-lg border border-border bg-muted/50 p-4 text-sm leading-6 text-foreground">
            {t(locale, 'auth.otherAccountBody', { email: session.email, role: roleLabel })}
          </p>
          <form action={logout}>
            <input type="hidden" name="surface" value={variant} />
            <Button type="submit" size="block">{t(locale, 'auth.otherAccountSwitch')}</Button>
          </form>
          {session.role && (
            <ButtonLink href={landingPathForRole(session.role)} variant="outline" size="block">
              {t(locale, 'auth.otherAccountContinue', { role: roleLabel })}
            </ButtonLink>
          )}
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      locale={locale}
      variant={variant}
      title={t(locale, variant === 'office' ? 'auth.signInTitle' : 'auth.welcomeBack')}
      description={description}
      footer={
        variant === 'office' ? (
          <>
            {t(locale, 'auth.noAccount')} <AuthFooterLink href="/signup">{t(locale, 'auth.signUp')}</AuthFooterLink>
          </>
        ) : undefined
      }
    >
      <AuthForm action={login} locale={locale}>
        <input type="hidden" name="surface" value={variant} />
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
              className="relative z-10 -my-2 inline-flex min-h-11 items-center rounded-md px-1 text-[13px] font-medium text-highlight underline-offset-4 hover:underline"
            >
              {t(locale, 'auth.forgotLink')}
            </Link>
          }
        />
        <AuthRemember label={t(locale, 'auth.remember')} />
        <AuthCaptcha />
        <AuthSubmit pendingLabel={t(locale, 'auth.signingIn')}>{t(locale, 'auth.signIn')}</AuthSubmit>
      </AuthForm>
    </AuthShell>
  );
}
