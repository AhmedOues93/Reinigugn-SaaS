import { redirect } from 'next/navigation';
import { PageHeader, Section } from '@/components/ui';
import { MfaPanel, type MfaFactorView } from '@/components/mfa-panel';
import { getCurrentCompany } from '@/lib/auth';
import { landingPathForRole } from '@/lib/landing';

export const metadata = { title: 'Sicherheit · ReinPlan' };

/**
 * Diese Seite liegt bewusst hinter `getCurrentCompany` und nicht hinter
 * `requireStaffCompany`: wer vom Zwei-Faktor-Riegel hierher geschickt wurde,
 * braucht gerade sie, und ein Riegel, der auch sein eigenes Formular
 * verschliesst, laesst niemanden mehr herein.
 */
export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ einrichten?: string }>;
}) {
  const { supabase, membership } = await getCurrentCompany();
  if (!membership) redirect('/onboarding');
  if (membership.role !== 'OWNER' && membership.role !== 'OFFICE') redirect(landingPathForRole(membership.role));

  const company = membership.companies as unknown as { require_staff_mfa?: boolean | null };
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const verified: MfaFactorView[] = (factors?.all ?? [])
    .filter((factor) => factor.status === 'verified')
    .map((factor) => ({
      id: factor.id,
      friendlyName: factor.friendly_name ?? null,
      createdAt: factor.created_at,
    }));

  const params = await searchParams;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Sicherheit"
        description="Zweiter Faktor für die Anmeldung am Büro-Zugang."
      />
      <Section
        title="Anmeldung"
        description="Ein Code aus einer App auf dem Telefon, zusätzlich zum Passwort."
      >
        <MfaPanel
          factors={verified}
          required={company?.require_staff_mfa === true}
          isOwner={membership.role === 'OWNER'}
          startEnrolment={params.einrichten === '1'}
        />
      </Section>
    </div>
  );
}
