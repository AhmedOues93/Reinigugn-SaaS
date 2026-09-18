import { redirect } from 'next/navigation';
import { createCompany } from '../(auth)/actions';
import { getCurrentCompany } from '@/lib/auth';
import { landingPathForRole } from '@/lib/landing';
import { AuthMessage } from '@/components/auth-message';
import { AuthShell } from '@/components/auth-shell';
import { Button, Field, Input } from '@/components/ui';
import { t } from '@/lib/i18n';
import { currentLocale } from '@/lib/i18n-server';

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { membership } = await getCurrentCompany();
  if (membership) redirect(landingPathForRole(membership.role));
  const [{ error }, locale] = await Promise.all([searchParams, currentLocale()]);

  return (
    <AuthShell locale={locale} title={t(locale, 'auth.onboardingTitle')} description={t(locale, 'auth.onboardingSubtitle')}>
      <form action={createCompany} className="space-y-5">
        <AuthMessage error={error} />
        <Field label={t(locale, 'auth.companyName')} htmlFor="name">
          <Input id="name" name="name" autoComplete="organization" maxLength={120} required />
        </Field>
        <Button size="block" type="submit">
          {t(locale, 'auth.createCompany')}
        </Button>
      </form>
    </AuthShell>
  );
}
