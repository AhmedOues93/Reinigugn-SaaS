import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { ProductBrand } from '@/components/company-brand';
import { direction, t, type Locale } from '@/lib/i18n';

/**
 * Branded frame for every unauthenticated screen.
 *
 * The background is a CSS gradient plus an inline SVG texture rather than a
 * raster image: it costs no extra request, stays crisp at any size and cannot
 * become a slow first paint on a phone. The card uses a light backdrop blur over
 * it, and the marketing column is hidden below `lg` so the form is never pushed
 * below the fold on a handset.
 */
export function AuthShell({
  children,
  title,
  description,
  locale,
  footer,
}: {
  children: React.ReactNode;
  title: string;
  description: string;
  locale: Locale;
  footer?: React.ReactNode;
}) {
  const benefits = [t(locale, 'auth.benefit1'), t(locale, 'auth.benefit2'), t(locale, 'auth.benefit3')];

  return (
    <main dir={direction(locale)} className="relative min-h-[100dvh] overflow-hidden bg-slate-950">
      <AuthBackdrop />

      <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-6xl flex-col justify-center gap-10 px-4 py-10 lg:flex-row lg:items-center lg:gap-16 lg:py-16">
        {/* Marketing column: desktop only, so it can never crowd the form. */}
        <section className="hidden max-w-md flex-1 text-white lg:block">
          <ProductBrand className="text-2xl text-white [&_span]:text-teal-300" />
          <p className="mt-6 text-balance text-3xl font-semibold leading-tight tracking-tight">{t(locale, 'auth.tagline')}</p>
          <ul className="mt-8 space-y-3.5">
            {benefits.map((benefit) => (
              <li key={benefit} className="flex items-start gap-3 text-sm leading-6 text-white/80">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-teal-300" aria-hidden="true" />
                {benefit}
              </li>
            ))}
          </ul>
        </section>

        <div className="mx-auto w-full max-w-md lg:mx-0">
          <Link href="/" className="mb-7 inline-flex min-h-touch items-center lg:hidden">
            <ProductBrand className="text-white [&_span]:text-teal-300" />
          </Link>

          <section className="rounded-2xl border border-white/15 bg-white/95 p-6 shadow-popover backdrop-blur-xl sm:p-8">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
            <div className="mt-7">{children}</div>
          </section>

          {footer && <div className="mt-6 text-center text-sm text-white/70">{footer}</div>}
        </div>
      </div>
    </main>
  );
}

/** Gradient wash plus a faint dot grid, both purely decorative. */
function AuthBackdrop() {
  const dots =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Ccircle cx='2' cy='2' r='1' fill='%23ffffff' fill-opacity='0.14'/%3E%3C/svg%3E";
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_15%_10%,#0f766e_0%,#134e4a_38%,#0b1220_78%)]" />
      <div className="absolute inset-0 opacity-70" style={{ backgroundImage: `url("${dots}")` }} />
      <div className="absolute -left-24 top-1/4 size-80 rounded-full bg-teal-400/20 blur-3xl" />
      <div className="absolute -right-20 bottom-0 size-96 rounded-full bg-emerald-300/10 blur-3xl" />
    </div>
  );
}

/** Link styled for use on the dark backdrop below the card. */
export function AuthFooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex min-h-touch items-center font-medium text-white underline-offset-4 hover:underline">
      {children}
    </Link>
  );
}
