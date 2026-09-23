import type { Metadata } from 'next';
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
 * Public marketing home.
 *
 * The company domain must stay a real public website, even when the browser
 * already carries a ReinPlan session. The three product surfaces have their
 * own explicit entry points; opening the brand/domain must never unexpectedly
 * throw a customer, employee or office user into an authenticated workspace.
 */
export default function Home() {
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
