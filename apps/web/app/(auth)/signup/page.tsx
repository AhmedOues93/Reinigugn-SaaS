import Link from 'next/link';
import { signUp } from '../actions';
import { AuthMessage } from '@/components/auth-message';
import { AuthShell } from '@/components/auth-shell';
import { Button, Input } from '@/components/ui';

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <AuthShell title="Konto erstellen" description="Starte mit deinem Unternehmenskonto bei SauberWerk.">
    <form action={signUp} className="space-y-5">
      <AuthMessage error={error} />
      <label className="block text-sm font-medium">E-Mail-Adresse<Input className="mt-1.5" name="email" type="email" autoComplete="email" required /></label>
      <label className="block text-sm font-medium">Passwort<Input className="mt-1.5" name="password" type="password" autoComplete="new-password" minLength={12} required /><span className="mt-1 block text-xs font-normal text-slate-500">Mindestens 12 Zeichen.</span></label>
      <Button className="w-full" type="submit">Konto erstellen</Button>
    </form>
    <p className="mt-6 text-center text-sm text-slate-600">Bereits registriert? <Link href="/login" className="font-medium text-teal-700 hover:underline">Anmelden</Link></p>
  </AuthShell>;
}
