import Link from 'next/link';
import { login, loginWithGoogle } from '@/app/(auth)/actions';
import { AuthMessage } from '@/components/auth-message';
import { AuthFooterLink, AuthShell, type AuthVariant } from '@/components/auth-shell';
import { AuthField, AuthForm, AuthRemember, AuthSubmit } from '@/components/auth-form';
import { Lock, Mail } from 'lucide-react';
import { t } from '@/lib/i18n';
import { currentLocale } from '@/lib/i18n-server';

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
  const next = variant === 'employee' ? '/mitarbeiter' : variant === 'portal' ? '/kunde' : '/dashboard';

  return (
    <AuthShell
      locale={locale}
      variant={variant}
      title={t(locale, variant === 'office' ? 'auth.signInTitle' : 'auth.welcomeBack')}
      description={t(locale, variant === 'employee' ? 'auth.signInEmployee' : variant === 'portal' ? 'auth.signInPortal' : 'auth.signInSubtitle')}
      footer={
        variant === 'office' ? (
          <>
            {t(locale, 'auth.noAccount')} <AuthFooterLink href="/signup">{t(locale, 'auth.signUp')}</AuthFooterLink>
          </>
        ) : undefined
      }
    >
      <form action={loginWithGoogle}>
        <input type="hidden" name="next" value={next} />
        <button type="submit" className="mb-5 flex min-h-12 w-full items-center justify-center gap-3 rounded-lg border border-border bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-highlight">
          <span aria-hidden="true" className="text-base font-bold">G</span>
          Mit Google anmelden
        </button>
      </form>
      <div className="mb-5 flex items-center gap-3 text-xs text-muted-foreground" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        <span>oder</span>
        <span className="h-px flex-1 bg-border" />
      </div>
      <AuthForm action={login} locale={locale}>
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
        <AuthSubmit pendingLabel={t(locale, 'auth.signingIn')}>{t(locale, 'auth.signIn')}</AuthSubmit>
      </AuthForm>
    </AuthShell>
  );
}
