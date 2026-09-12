import Link from 'next/link';
import { login } from '../actions';
import { AuthMessage } from '@/components/auth-message';
import { AuthShell } from '@/components/auth-shell';
import { Button, Input } from '@/components/ui';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const { error, message } = await searchParams;
  return <AuthShell title="Anmelden" description="Melde dich bei deinem Unternehmenskonto an.">
    <form action={login} className="space-y-5">
      <AuthMessage error={error} message={message} />
      <label className="block text-sm font-medium">E-Mail-Adresse<Input className="mt-1.5" name="email" type="email" autoComplete="email" required /></label>
      <label className="block text-sm font-medium">Passwort<Input className="mt-1.5" name="password" type="password" autoComplete="current-password" required /></label>
      <div className="flex justify-end"><Link href="/forgot-password" className="text-sm text-teal-700 hover:underline">Passwort vergessen?</Link></div>
      <Button className="w-full" type="submit">Anmelden</Button>
    </form>
    <p className="mt-6 text-center text-sm text-slate-600">Noch kein Konto? <Link href="/signup" className="font-medium text-teal-700 hover:underline">Jetzt registrieren</Link></p>
  </AuthShell>;
}
