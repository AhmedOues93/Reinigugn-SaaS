import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import { BrandBackdrop } from '@/components/brand-backdrop';
import { brandImage } from '@/lib/brand-assets';
import { hero } from '@/lib/marketing-content';
import { AccentedHeadline } from './section';

/**
 * The first screen.
 *
 * Deliberately the same composition as the sign-in screen: the same
 * photograph, the same veil, the same accented headline. Somebody who clicks
 * "Anmelden" should land somewhere that plainly belongs to what they just
 * read, and reusing `BrandBackdrop` means the veil that guarantees white text
 * clears AA is the tested one rather than a second copy of the idea.
 */
export function Hero() {
  return (
    <section className="relative isolate overflow-hidden bg-ink text-ink-foreground">
      <BrandBackdrop photo={brandImage.authBackdrop} weight="side" />
      <div className="grid-lines pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />

      <div className="mx-auto w-full max-w-[1180px] px-5 py-16 sm:px-6 sm:py-20 md:py-28 lg:px-8 lg:py-32">
        <div className="max-w-[46rem] animate-rise-in">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-highlight/85">{hero.eyebrow}</p>

          <h1 className="mt-4 text-[2.3rem] font-semibold leading-[1.06] tracking-[-0.03em] text-white sm:text-[3rem] lg:text-[3.6rem]">
            <AccentedHeadline headline={hero.headline} accent={hero.headlineAccent} />
          </h1>

          <p className="mt-6 max-w-[42rem] text-[15px] leading-7 text-white/70 sm:text-[17px] sm:leading-8">
            {hero.subline}
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href={hero.primaryCta.href}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-highlight px-6 text-base font-semibold text-ink shadow-[0_10px_30px_-12px_rgb(52_211_153/0.7)] transition-colors hover:bg-[hsl(158_64%_58%)]"
            >
              {hero.primaryCta.label}
              <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
            </Link>
            <Link
              href={hero.secondaryCta.href}
              className="inline-flex min-h-12 items-center justify-center rounded-lg border border-white/20 bg-white/[0.06] px-6 text-base font-semibold text-white backdrop-blur-sm transition-colors hover:border-white/35 hover:bg-white/[0.12]"
            >
              {hero.secondaryCta.label}
            </Link>
          </div>

          <ul className="mt-9 flex flex-wrap gap-x-6 gap-y-2.5">
            {hero.assurances.map((item) => (
              <li key={item} className="flex min-w-0 items-center gap-2 text-[13px] text-white/60">
                <Check className="size-4 shrink-0 text-highlight" aria-hidden="true" />
                <span className="min-w-0">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
