import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { closing } from '@/lib/marketing-content';

/**
 * The last thing on the page before the footer.
 *
 * It closes with the same handwritten promise the sign-in screen signs off
 * with, so the page ends where the product begins.
 */
export function ClosingCta() {
  return (
    <section className="surface-ink relative isolate overflow-hidden text-ink-foreground">
      <div className="grid-lines pointer-events-none absolute inset-0 opacity-70" aria-hidden="true" />
      <div className="relative mx-auto w-full max-w-[1180px] px-5 py-16 text-center sm:px-6 sm:py-20 md:py-28 lg:px-8">
        <h2 className="mx-auto max-w-[24ch] text-[1.9rem] font-semibold leading-[1.12] tracking-[-0.03em] text-white sm:text-[2.6rem]">
          {closing.title}
        </h2>
        <p className="mx-auto mt-4 max-w-[38rem] text-[15px] leading-7 text-white/65 sm:text-base">{closing.body}</p>

        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href={closing.cta.href}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-highlight px-7 text-base font-semibold text-ink shadow-[0_10px_30px_-12px_rgb(52_211_153/0.7)] transition-colors hover:bg-[hsl(158_64%_58%)] sm:w-auto"
          >
            {closing.cta.label}
            <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
          </Link>
          <Link
            href={closing.secondary.href}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-lg border border-white/20 bg-white/[0.06] px-7 text-base font-semibold text-white transition-colors hover:border-white/35 hover:bg-white/[0.12] sm:w-auto"
          >
            {closing.secondary.label}
          </Link>
        </div>

        <p className="mt-14 select-none">
          <span className="block whitespace-pre-line font-[system-ui] text-[1.3rem] italic leading-[1.3] tracking-tight text-white/80">
            {closing.signature}
          </span>
          <svg viewBox="0 0 150 10" className="mx-auto mt-2 h-2.5 w-[9rem] text-highlight" aria-hidden="true">
            <path d="M2 7C28 2 62 1 96 4c18 1.6 34 3 52 1.4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </p>
      </div>
    </section>
  );
}
