import Link from 'next/link';
import { Check } from 'lucide-react';
import { cn } from '@reinigung/ui';
import { pricing } from '@/lib/marketing-content';
import { Section, SectionHeading } from './section';

/**
 * The plans.
 *
 * One tier is marked `featured` and is the only one that carries the filled
 * button; the others are outlined. That is the whole emphasis mechanism — no
 * scaling, no shadow tricks — because a price table that shouts is a price
 * table people distrust.
 *
 * `pricing.placeholderWarning` renders an unmistakable notice while the figures
 * are stand-ins, following the same rule the offer PDF already applies to its
 * sample AGB: placeholder commercial content must never be able to pass for the
 * real thing.
 */
export function Pricing() {
  return (
    <Section id="preise" tone="card">
      <SectionHeading
        eyebrow="Preise"
        title="Ein Preis je Betrieb, keine Überraschungen"
        body="Alle Zugänge inklusive: Büro, Mitarbeiter-App und Kundenportal. Monatlich kündbar."
      />

      {pricing.placeholderWarning && (
        <p className="mx-auto mt-8 max-w-[46rem] rounded-xl border border-warning/25 bg-warning-soft px-4 py-3 text-center text-sm leading-6 text-warning">
          Platzhalter: Diese Preise sind noch nicht final und stellen kein Angebot dar.
        </p>
      )}

      <div className="mt-12 grid gap-5 lg:grid-cols-3">
        {pricing.plans.map((plan) => {
          const numeric = /^\d/.test(plan.price);
          return (
            <article
              key={plan.name}
              className={cn(
                'flex min-w-0 flex-col rounded-card border bg-background p-6 sm:p-7',
                plan.featured ? 'border-primary/45 shadow-raised' : 'border-border/80',
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-foreground">{plan.name}</h3>
                {plan.featured && (
                  <span className="shrink-0 rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary">
                    Empfohlen
                  </span>
                )}
              </div>

              <p className="mt-4 flex items-baseline gap-1.5">
                {numeric && <span className="text-[15px] font-medium text-muted-foreground">€</span>}
                <span className="text-[2.1rem] font-semibold leading-none tracking-[-0.03em] tabular-nums text-foreground">
                  {plan.price}
                </span>
                {plan.unit && <span className="text-sm text-muted-foreground">{plan.unit}</span>}
              </p>

              <p className="mt-3 text-sm leading-6 text-muted-foreground">{plan.summary}</p>

              <ul className="mt-6 flex-1 space-y-2.5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex min-w-0 gap-2.5 text-sm leading-6 text-foreground">
                    <Check className="mt-1 size-4 shrink-0 text-primary" aria-hidden="true" />
                    <span className="min-w-0">{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={numeric ? '/signup' : '/login'}
                className={cn(
                  'mt-7 inline-flex min-h-12 w-full items-center justify-center rounded-lg px-4 text-base font-semibold transition-colors',
                  plan.featured
                    ? 'bg-primary text-primary-foreground shadow-[inset_0_1px_0_0_rgb(255_255_255/0.14)] hover:bg-[hsl(162_88%_21%)]'
                    : 'border border-input bg-card text-foreground shadow-card hover:border-foreground/25 hover:bg-subtle',
                )}
              >
                {plan.cta}
              </Link>
            </article>
          );
        })}
      </div>

      <p className="mt-8 text-center text-sm text-muted-foreground">{pricing.note}</p>
    </Section>
  );
}
