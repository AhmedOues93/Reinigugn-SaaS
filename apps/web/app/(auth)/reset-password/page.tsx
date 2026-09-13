import { updatePassword } from '../actions';
import { AuthMessage } from '@/components/auth-message';
import { AuthShell } from '@/components/auth-shell';
import { Button, Input } from '@/components/ui';

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <AuthShell title="Neues Passwort" description="Wähle ein neues, sicheres Passwort für dein Konto.">
    <form action={updatePassword} className="space-y-5">
      <AuthMessage error={error} />
      <label className="block text-sm font-medium">Neues Passwort<Input className="mt-1.5" name="password" type="password" autoComplete="new-password" minLength={12} required /></label>
      <Button className="w-full" type="submit">Passwort speichern</Button>
    </form>
  </AuthShell>;
}
