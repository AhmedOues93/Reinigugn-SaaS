import Link from 'next/link';
import { Calculator, CalendarCheck, ClipboardCheck, FileText, ReceiptText, ShieldCheck } from 'lucide-react';
import { BrandBackdrop } from '@/components/brand-backdrop';
import { BrandMark } from '@/components/brand-mark';
import { LanguageSelector } from '@/components/language-selector';
import { ProductBrand } from '@/components/company-brand';
import { brandImage } from '@/lib/brand-assets';
import { direction, t, type Locale } from '@/lib/i18n';

/**
 * The frame every unauthenticated screen sits in.
 *
 * One photograph, one veil, one card. The image carries the trade — a building
 * at the hour it actually gets cleaned — and the veil exists so the copy over
 * it clears AA no matter which part of the frame a given viewport crops to.
 *
 * Three audiences share the composition and differ only in what they are told:
 * the office is being sold a way of working, an employee wants their shift, a
 * customer wants their invoice. `variant` picks the copy and the weighting;
 * everything else is deliberately identical, because a company that looks like
 * three different products is a company nobody trusts with their billing.
 */
export type AuthVariant = 'office' | 'employee' | 'portal';

export function AuthShell({
  children,
  title,
  description,
  locale,
  footer,
  variant = 'office',
}: {
  children: React.ReactNode;
  title: string;
  description: string;
  locale: Locale;
  footer?: React.ReactNode;
  variant?: AuthVariant;
}) {
  // The office gets the two-column composition; the field and the portal get a
  // single centred column, because both are opened on a phone far more often
  // than on a desk and a half-width form on a phone is just a narrow form.
  const wide = variant === 'office';

  return (
    <main
      dir={direction(locale)}
      className="relative isolate min-h-[100dvh] overflow-hidden bg-ink text-ink-foreground"
    >
      <BrandBackdrop
        photo={variant === 'employee' ? brandImage.employeeBackdrop : brandImage.authBackdrop}
        weight={wide ? 'side' : 'centre'}
      />

      {/* The lockup and the language switch ride above the composition, so
          they keep the same place whether the pitch column is shown or not. */}
      <div className="absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-4 px-5 py-5 sm:px-8 lg:px-10">
        <Link href="/" className="inline-flex items-center gap-3">
          <BrandMark className="size-9 shrink-0 text-highlight" />
          <span className={wide ? 'hidden sm:block' : 'sr-only'}>
            <ProductBrand className="block text-[1.35rem] leading-none text-white [&_span]:text-highlight" />
            <span className="mt-1 block text-[11.5px] text-white/55">{t(locale, 'auth.brandLine')}</span>
          </span>
        </Link>
        <LanguageSelector
          locale={locale}
          className="auth-language block w-[8.5rem] shrink-0 text-sm text-white"
        />
      </div>

      <div
        className={
          wide
            ? 'relative mx-auto grid min-h-[100dvh] w-full max-w-[1320px] items-center gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[1.05fr_minmax(0,470px)] lg:gap-16 lg:px-10'
            : 'relative mx-auto flex min-h-[100dvh] w-full max-w-[520px] flex-col justify-center px-5 py-24 sm:px-6'
        }
      >
        {wide && <OfficePitch locale={locale} />}

        <div className={wide ? 'mx-auto w-full max-w-[460px] animate-rise-in lg:mx-0' : 'w-full animate-rise-in'}>
          {/*
            A dark card rather than a white one. A bright sheet over a night
            photograph is a hole punched in the image; this sits in the same
            light as the building behind it.
          */}
          <section className="auth-surface relative rounded-[1.5rem] border border-white/10 bg-[#071d24]/75 p-6 text-center shadow-glass backdrop-blur-2xl sm:p-9">
            <BrandMark className="mx-auto size-11 text-highlight" />
            <p className="mt-3 text-[1.35rem] font-semibold tracking-tight text-white">
              <ProductBrand className="text-[1.35rem] text-white [&_span]:text-highlight" />
            </p>
            <h1 className="mt-4 text-[1.45rem] font-semibold leading-tight tracking-[-0.02em] text-white">{title}</h1>
            <p className="mt-1.5 text-sm leading-6 text-white/60">{description}</p>
            <div className="mt-7 text-start">{children}</div>
          </section>

          {footer && <div className="mt-6 text-center text-sm text-white/60">{footer}</div>}

          <p className="mt-7 flex items-center justify-center gap-2 text-xs text-white/45">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            {t(locale, 'auth.secure')}
          </p>
        </div>
      </div>

      {/*
        The promise, written rather than set: three words the company would say
        to a customer, in the corner where a signature belongs. Desktop only —
        on a phone the photograph has no corner to spare.
      */}
      {variant === 'employee' && (
        <p className="pointer-events-none absolute inset-x-0 bottom-8 select-none whitespace-pre-line px-8 text-center text-[1.35rem] font-semibold leading-tight tracking-tight text-white lg:hidden">
          {t(locale, 'auth.employeeTagline')}
        </p>
      )}

      <p className="pointer-events-none absolute bottom-10 start-10 hidden select-none lg:block">
        <span className="block whitespace-pre-line font-[system-ui] text-[1.45rem] italic leading-[1.3] tracking-tight text-white/85">
          {t(locale, 'auth.signature')}
        </span>
        <svg viewBox="0 0 150 10" className="mt-1.5 h-2.5 w-[9rem] text-highlight" aria-hidden="true">
          <path d="M2 7C28 2 62 1 96 4c18 1.6 34 3 52 1.4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      </p>
    </main>
  );
}

/**
 * What the office is actually buying, in four words each.
 *
 * Desktop only: on a phone it would push the form below the fold, and somebody
 * trying to sign in at 6 a.m. does not want a pitch first.
 */
function OfficePitch({ locale }: { locale: Locale }) {
  const capabilities = [
    { icon: FileText, label: 'Anfrage & Angebot' },
    { icon: Calculator, label: 'Kalkulation' },
    { icon: CalendarCheck, label: 'Einsatzplanung' },
    { icon: ClipboardCheck, label: 'Leistungsnachweis' },
    { icon: ShieldCheck, label: 'Qualität' },
    { icon: ReceiptText, label: 'Abrechnung' },
  ] as const;

  return (
    <section className="hidden lg:block">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-highlight/80">
        {t(locale, 'auth.eyebrow')}
      </p>
      {/*
        The last word carries the accent. It is the one the product is actually
        selling — the rest of the sentence is what the customer already does.
      */}
      <h2 className="mt-4 max-w-[19ch] text-[3rem] font-semibold leading-[1.06] tracking-[-0.03em] text-white">
        {headlineParts(t(locale, 'auth.headline'), t(locale, 'auth.headlineAccent'))}
      </h2>
      <p className="mt-5 max-w-[38ch] text-[15px] leading-7 text-white/70">{t(locale, 'auth.tagline')}</p>

      <ul className="mt-10 grid max-w-[30rem] grid-cols-3 gap-x-3 gap-y-4">
        {capabilities.map(({ icon: Icon, label }) => (
          <li key={label} className="min-w-0">
            <span className="grid size-12 place-items-center rounded-xl border border-white/15 bg-white/[0.07]">
              <Icon className="size-[21px] text-white" strokeWidth={2.35} aria-hidden="true" />
            </span>
            <span className="mt-2.5 block text-[13px] font-semibold leading-[1.35] text-white/85">{label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Splits a headline around its accent word without hard-coding either. A
 * translation that omits the accent simply renders plain, which is better than
 * emphasising the wrong word in a language nobody here reads.
 */
function headlineParts(headline: string, accent: string) {
  const at = accent ? headline.lastIndexOf(accent) : -1;
  if (at < 0) return headline;
  return (
    <>
      {headline.slice(0, at)}
      <span className="text-highlight">{headline.slice(at, at + accent.length)}</span>
      {headline.slice(at + accent.length)}
    </>
  );
}

/** Link styled for use on the dark backdrop below the card. */
export function AuthFooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-touch items-center font-medium text-white underline decoration-white/30 underline-offset-4 transition-colors hover:decoration-highlight"
    >
      {children}
    </Link>
  );
}
