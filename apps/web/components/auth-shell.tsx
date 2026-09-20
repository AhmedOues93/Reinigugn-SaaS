import Link from 'next/link';
import { BarChart3, CalendarCheck, ShieldCheck, Users } from 'lucide-react';
import { BrandBackdrop } from '@/components/brand-backdrop';
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

      <div
        className={
          wide
            ? 'relative mx-auto grid min-h-[100dvh] w-full max-w-[1280px] items-center gap-12 px-4 py-8 sm:px-6 lg:grid-cols-[1.05fr_minmax(0,460px)] lg:gap-16 lg:px-10 lg:py-14'
            : 'relative mx-auto flex min-h-[100dvh] w-full max-w-[520px] flex-col justify-center px-5 py-10 sm:px-6'
        }
      >
        {wide && <OfficePitch locale={locale} />}

        <div className={wide ? 'mx-auto w-full max-w-[460px] animate-rise-in lg:mx-0' : 'w-full animate-rise-in'}>
          <div className={wide ? 'mb-8 lg:hidden' : 'mb-9 flex flex-col items-center text-center'}>
            <Link href="/" className="inline-flex min-h-touch items-center">
              <ProductBrand className="text-xl text-white [&_span]:text-highlight" />
            </Link>
            {!wide && (
              <p className="mt-3 text-[15px] leading-6 text-white/70">
                {t(locale, variant === 'employee' ? 'auth.employeeIntro' : 'auth.portalIntro')}
              </p>
            )}
          </div>

          {/*
            A dark card rather than a white one. A bright sheet over a night
            photograph is a hole punched in the image; this sits in the same
            light as the building behind it.
          */}
          <section className="auth-surface relative rounded-[1.4rem] border border-white/10 bg-white/[0.06] p-6 shadow-glass backdrop-blur-xl sm:p-8">
            <h1 className="text-[1.6rem] font-semibold leading-tight tracking-[-0.02em] text-white">{title}</h1>
            <p className="mt-2 text-[15px] leading-6 text-white/65">{description}</p>
            <div className="mt-7">{children}</div>
          </section>

          {footer && <div className="mt-6 text-center text-sm text-white/60">{footer}</div>}

          <p className="mt-7 flex items-center justify-center gap-2 text-xs text-white/45">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            {t(locale, 'auth.secure')}
          </p>
        </div>
      </div>
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
    { icon: Users, key: 'auth.capCustomers' },
    { icon: CalendarCheck, key: 'auth.capPlanning' },
    { icon: ShieldCheck, key: 'auth.capQuality' },
    { icon: BarChart3, key: 'auth.capResults' },
  ] as const;

  return (
    <section className="hidden lg:block">
      <ProductBrand className="text-[1.3rem] text-white [&_span]:text-highlight" />

      <p className="mt-14 text-[11px] font-medium uppercase tracking-[0.18em] text-highlight/80">
        {t(locale, 'auth.eyebrow')}
      </p>
      <h2 className="mt-4 max-w-[19ch] text-[2.9rem] font-semibold leading-[1.06] tracking-[-0.03em] text-white">
        {t(locale, 'auth.headline')}
      </h2>
      <p className="mt-5 max-w-[38ch] text-[15px] leading-7 text-white/70">{t(locale, 'auth.tagline')}</p>

      <ul className="mt-11 grid max-w-[34rem] grid-cols-4 gap-x-6 gap-y-7">
        {capabilities.map(({ icon: Icon, key }) => (
          <li key={key} className="min-w-0">
            <span className="grid size-11 place-items-center rounded-xl border border-white/12 bg-white/[0.07]">
              <Icon className="size-[19px] text-white" aria-hidden="true" />
            </span>
            <span className="mt-3 block text-[13px] font-medium leading-5 text-white/85">{t(locale, key)}</span>
          </li>
        ))}
      </ul>
    </section>
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
