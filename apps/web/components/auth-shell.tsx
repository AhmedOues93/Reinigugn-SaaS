import Link from 'next/link';
import { Check, ShieldCheck } from 'lucide-react';
import { ProductBrand } from '@/components/company-brand';
import { direction, t, type Locale } from '@/lib/i18n';

/**
 * Branded frame for every unauthenticated screen.
 *
 * Composition: a Tiefsee field with a hairline facade grid, two soft light
 * sources and one diagonal "squeegee" streak — the look of clean glass. On large
 * screens the left half shows what the product actually does (a day of visits
 * being worked through) instead of marketing bullets; the form sits on a bright
 * glass sheet on the right. Everything is CSS: no image request, nothing to
 * delay first paint on a phone, and below `lg` only the brand and form remain.
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
  return (
    <main dir={direction(locale)} className="relative isolate min-h-[100dvh] overflow-hidden bg-ink text-ink-foreground">
      <AuthBackdrop />

      <div className="relative mx-auto grid min-h-[100dvh] w-full max-w-[1200px] items-center gap-12 px-4 py-8 sm:px-6 lg:grid-cols-[1.1fr_minmax(0,440px)] lg:gap-20 lg:px-10 lg:py-14">
        {/* Product column: desktop only, so it can never push the form below the fold. */}
        <section className="hidden lg:block" aria-hidden="true">
          <ProductBrand className="text-[1.35rem] text-white [&_span]:text-highlight" />
          <p className="mt-10 max-w-[30rem] text-[2.35rem] font-medium leading-[1.12] tracking-[-0.025em] text-white">
            {t(locale, 'auth.tagline')}
          </p>
          <DayPanel locale={locale} />
        </section>

        <div className="mx-auto w-full max-w-[440px] animate-rise-in lg:mx-0">
          <Link href="/" className="mb-8 inline-flex min-h-touch items-center lg:hidden">
            <ProductBrand className="text-xl text-white [&_span]:text-highlight" />
          </Link>

          <section className="relative rounded-[1.4rem] bg-card/[0.97] p-6 text-card-foreground shadow-glass ring-1 ring-white/40 backdrop-blur-xl sm:p-9">
            <h1 className="text-[1.65rem] font-semibold leading-tight tracking-[-0.02em]">{title}</h1>
            <p className="mt-2 text-[15px] leading-6 text-muted-foreground">{description}</p>
            <div className="mt-8">{children}</div>
          </section>

          {footer && <div className="mt-6 text-center text-sm text-ink-muted">{footer}</div>}

          <p className="mt-8 flex items-center justify-center gap-2 text-xs text-ink-muted/80">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            {t(locale, 'auth.secure')}
          </p>
        </div>
      </div>
    </main>
  );
}

/** Purely decorative light: grid, two blurred sources, one streak, film grain. */
function AuthBackdrop() {
  return (
    <div aria-hidden="true" className="grain pointer-events-none absolute inset-0 -z-10">
      <div className="absolute inset-0 bg-[radial-gradient(90%_70%_at_18%_12%,hsl(189_80%_24%)_0%,hsl(193_65%_12%)_58%,hsl(196_70%_7%)_100%)]" />
      <div className="grid-lines absolute inset-0 [mask-image:radial-gradient(75%_65%_at_30%_35%,black,transparent)]" />
      <div className="absolute -start-40 top-[8%] size-[36rem] rounded-full bg-[hsl(185_64%_45%/0.22)] blur-[110px]" />
      <div className="absolute -end-32 bottom-[-10%] size-[30rem] rounded-full bg-[hsl(160_60%_40%/0.14)] blur-[110px]" />
      {/* The streak: a single wiped band of light across the field. */}
      <div className="absolute -inset-x-1/4 top-[-20%] h-[140%] rotate-[24deg] bg-[linear-gradient(90deg,transparent,hsl(185_80%_85%/0.07)_40%,hsl(185_80%_90%/0.11)_50%,hsl(185_80%_85%/0.04)_60%,transparent)] [mask-image:linear-gradient(90deg,transparent_30%,black_45%,black_55%,transparent_70%)]" />
    </div>
  );
}

/**
 * A schematic day: four visits with their state. It is illustration, not data,
 * so it is hidden from assistive technology along with its column.
 */
function DayPanel({ locale }: { locale: Locale }) {
  const visits = [
    { time: '06:00', site: 'Praxis Dr. Albers', kind: 'Unterhaltsreinigung', state: 'done' },
    { time: '07:30', site: 'Kanzlei Brandt & Roth', kind: 'Büroreinigung', state: 'done' },
    { time: '09:15', site: 'Autohaus Lindner', kind: 'Glasreinigung', state: 'running' },
    { time: '13:00', site: 'Kita Sonnenhof', kind: 'Sanitärreinigung', state: 'planned' },
  ] as const;

  return (
    <div className="mt-12 max-w-[30rem] rounded-2xl border border-white/10 bg-white/[0.045] p-2 shadow-[0_30px_60px_-30px_rgb(0_0_0/0.6)] backdrop-blur-md">
      <div className="flex items-center justify-between px-4 pb-2 pt-3">
        <p className="text-sm font-medium text-white">{t(locale, 'auth.panelTitle')}</p>
        <p className="text-xs tabular-nums text-ink-muted">2 / 4</p>
      </div>
      <ol className="space-y-1">
        {visits.map((visit) => (
          <li
            key={visit.time}
            className={`flex items-center gap-4 rounded-xl px-4 py-3 ${
              visit.state === 'running' ? 'bg-white/[0.08] ring-1 ring-highlight/30' : ''
            }`}
          >
            <span className="w-12 shrink-0 text-sm font-medium tabular-nums text-white/90">{visit.time}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-white">{visit.site}</span>
              <span className="block truncate text-xs text-ink-muted">{visit.kind}</span>
            </span>
            {visit.state === 'done' && (
              <span className="flex items-center gap-1.5 text-xs text-highlight">
                <Check className="size-3.5" />
                {t(locale, 'auth.panelDone')}
              </span>
            )}
            {visit.state === 'running' && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-white">
                <span className="size-1.5 rounded-full bg-highlight motion-safe:animate-pulse-dot" />
                {t(locale, 'auth.panelRunning')}
              </span>
            )}
            {visit.state === 'planned' && <span className="text-xs text-ink-muted">{t(locale, 'auth.panelPlanned')}</span>}
          </li>
        ))}
      </ol>
      <p className="mx-2 mb-1 mt-2 flex items-center gap-2 rounded-lg border-t border-white/10 px-2 pb-1 pt-3 text-xs text-ink-muted">
        <span className="grid size-5 place-items-center rounded-full bg-highlight/15 text-highlight">
          <Check className="size-3" />
        </span>
        {t(locale, 'auth.panelProof')}
      </p>
    </div>
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
