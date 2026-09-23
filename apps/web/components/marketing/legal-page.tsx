import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';

/**
 * The frame the three legal pages share.
 *
 * `pending` marks a page whose text is still a stand-in. It renders an
 * unmissable notice, the same principle the offer PDF already applies to its
 * sample AGB: placeholder legal text must never be able to pass for the real
 * thing. An Impressum in particular is a statutory obligation with real
 * liability attached — the operator's own details have to be filled in here
 * before this site goes live, and no plausible-looking draft should stand in
 * the meantime.
 */
export function LegalPage({
  title,
  intro,
  pending = false,
  children,
}: {
  title: string;
  intro?: string;
  pending?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="min-h-[100dvh] bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[52rem] px-5 py-16 sm:px-6 md:py-24 lg:px-8">
        <Link
          href="/"
          className="inline-flex min-h-touch items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground md:min-h-9"
        >
          <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
          Zur Startseite
        </Link>

        <h1 className="mt-6 text-[2rem] font-semibold leading-tight tracking-[-0.03em] text-foreground sm:text-[2.4rem]">
          {title}
        </h1>
        {intro && <p className="mt-4 text-[15px] leading-7 text-muted-foreground">{intro}</p>}

        {pending && (
          <p className="mt-8 rounded-xl border border-warning/25 bg-warning-soft px-4 py-3.5 text-sm leading-6 text-warning">
            <strong className="font-semibold">Platzhalter – vor Veröffentlichung ersetzen.</strong> Dieser Text ist
            noch kein rechtsgültiger Inhalt. Die verbindlichen Angaben müssen vom Betreiber ergänzt und rechtlich
            geprüft werden.
          </p>
        )}

        {children && <div className="mt-10 space-y-8">{children}</div>}
      </main>
      <SiteFooter />
    </div>
  );
}

/** One titled block of legal prose. */
export function LegalSection({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-foreground">{heading}</h2>
      <div className="mt-2.5 space-y-3 text-[15px] leading-7 text-muted-foreground">{children}</div>
    </section>
  );
}
