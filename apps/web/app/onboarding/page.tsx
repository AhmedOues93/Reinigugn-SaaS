import { redirect } from 'next/navigation';
import { createCompany } from '../(auth)/actions';
import { getCurrentCompany } from '@/lib/auth';
import { AuthMessage } from '@/components/auth-message';
import { AuthShell } from '@/components/auth-shell';
import { Button, Input } from '@/components/ui';

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { membership } = await getCurrentCompany();
  if (membership) redirect('/dashboard');
  const { error } = await searchParams;
  return <AuthShell title="Dein Unternehmen" description="Lege dein Reinigungsunternehmen an. Du kannst den Namen später in den Einstellungen ändern.">
    <form action={createCompany} className="space-y-5">
      <AuthMessage error={error} />
      <label className="block text-sm font-medium">Firmenname<Input className="mt-1.5" name="name" autoComplete="organization" maxLength={120} required /></label>
      <Button className="w-full" type="submit">Unternehmen anlegen</Button>
    </form>
  </AuthShell>;
}
