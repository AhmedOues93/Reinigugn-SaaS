import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { signedInLandingPath } from '@/lib/auth';
import { ClosingCta } from '@/components/marketing/closing-cta';
import { DemoVideo } from '@/components/marketing/demo-video';
import { Features } from '@/components/marketing/features';
import { Hero } from '@/components/marketing/hero';
import { Pricing } from '@/components/marketing/pricing';
import { Screenshots } from '@/components/marketing/screenshots';
import { SiteFooter } from '@/components/marketing/site-footer';
import { SiteHeader } from '@/components/marketing/site-header';
import { Steps } from '@/components/marketing/steps';

export const metadata: Metadata = {
  title: 'ReinPlan – Software für Gebäudereinigung',
  description:
    'Angebot, Einsatzplanung, Zeiterfassung, Leistungsnachweis und Abrechnung für Reinigungsunternehmen – in einem Ablauf.',
};

/**
 * The public start page.
 *
 * Signed-in visitors never see it: they are sent straight to their own surface,
 * which is what `/` did before this page existed. Somebody who is already
 * working does not want the pitch, and an owner who opens the bookmark expects
 * the dashboard. The marketing page is for everyone else.
 */
export default async function Home() {
  const destination = await signedInLandingPath();
  if (destination) redirect(destination);

  return (
    <div className="min-h-[100dvh] bg-background">
      <SiteHeader />
      <main>
        <Hero />
        <Steps />
        <Features />
        <DemoVideo />
        <Screenshots />
        <Pricing />
        <ClosingCta />
      </main>
      <SiteFooter />
    </div>
  );
}
