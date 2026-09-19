import { redirect } from 'next/navigation';
import { createCompany } from '../(auth)/actions';
import { getCurrentCompany } from '@/lib/auth';
import { landingPathForRole } from '@/lib/landing';
import { AuthMessage } from '@/components/auth-message';
import { AuthShell } from '@/components/auth-shell';
import { AuthField, AuthForm, AuthSubmit } from '@/components/auth-form';
import { t } from '@/lib/i18n';
import { currentLocale } from '@/lib/i18n-server';

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { membership } = await getCurrentCompany();
  if (membership) redirect(landingPathForRole(membership.role));
  const [{ error }, locale] = await Promise.all([searchParams, currentLocale()]);

  return (
    <AuthShell locale={locale} title={t(locale, 'auth.onboardingTitle')} description={t(locale, 'auth.onboardingSubtitle')}>
      <AuthForm action={createCompany} locale={locale}>
        <AuthMessage error={error} />
        <AuthField name="name" rule="required" autoComplete="organization" label={t(locale, 'auth.companyName')} locale={locale} />
        <AuthSubmit pendingLabel={t(locale, 'auth.working')}>{t(locale, 'auth.createCompany')}</AuthSubmit>
      </AuthForm>
    </AuthShell>
  );
}
