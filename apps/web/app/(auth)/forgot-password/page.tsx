import Link from 'next/link';
import { requestPasswordReset } from '../actions';
import { AuthMessage } from '@/components/auth-message';
import { AuthShell } from '@/components/auth-shell';
import { Button, Input } from '@/components/ui';

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const { error, message } = await searchParams;
  return <AuthShell title="Passwort vergessen" description="Wir senden dir einen Link zum Zuruecksetzen deines Passworts.">
    <form action={requestPasswordReset} className="space-y-5">
      <AuthMessage error={error} message={message} />
      <label className="block text-sm font-medium">E-Mail-Adresse<Input className="mt-1.5" name="email" type="email" autoComplete="email" required /></label>
      <Button className="w-full" type="submit">Link anfordern</Button>
    </form>
    <p className="mt-6 text-center"><Link href="/login" className="text-sm font-medium text-teal-700 hover:underline">Zurueck zur Anmeldung</Link></p>
  </AuthShell>;
}
