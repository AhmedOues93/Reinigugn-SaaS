import { redirect } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { MfaChallengeForm } from '@/components/mfa-challenge-form';
import { getCurrentCompany } from '@/lib/auth';

export const metadata = { title: 'Bestätigen · ReinPlan' };

/**
 * Der zweite Schritt der Anmeldung. Bewusst ohne Navigation und ohne Daten:
 * hier ist nichts zu tun als der Code.
 */
export default async function MfaChallengePage() {
  const { supabase } = await getCurrentCompany();
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  // Wer schon bestaetigt hat, hat hier nichts verloren.
  if (data?.currentLevel === 'aal2' || data?.nextLevel !== 'aal2') redirect('/dashboard');

  return (
    <div className="mx-auto max-w-sm py-6">
      <div className="rounded-xl border border-border/80 bg-card p-5 shadow-card sm:p-6">
        <span className="grid size-10 place-items-center rounded-lg bg-primary-soft text-primary">
          <ShieldCheck className="size-5" />
        </span>
        <h1 className="mt-4 text-xl font-semibold">Noch ein Schritt</h1>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">
          Gib den sechsstelligen Code aus deiner Authenticator-App ein.
        </p>
        <div className="mt-5">
          <MfaChallengeForm />
        </div>
      </div>
    </div>
  );
}
