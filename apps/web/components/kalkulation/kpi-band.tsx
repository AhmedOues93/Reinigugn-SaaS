import { cn } from '@reinigung/ui';
import { formatMoney } from '@/lib/format';
import { formatBp, formatMinutes, type Calculation } from '@/lib/data/kalkulation';

/**
 * The six numbers an office actually decides on, kept visible while working
 * anywhere in the calculation.
 *
 * Margin and markup sit side by side deliberately. They are different
 * quantities computed from the same pair of figures, and treating them as
 * interchangeable is the most common way a small firm prices itself below
 * cost — a 30 % margin is a 42.9 % markup, and quoting "cost plus 30 %"
 * against a 30 % target loses money on every visit.
 */
export function CalculationKpiBand({ calculation }: { calculation: Calculation }) {
  const loss = calculation.contribution_cents_month < 0;
  const thin = !loss && calculation.margin_bp < 500 && calculation.selling_price_cents_month > 0;

  const items: { label: string; value: string; hint?: string; tone?: 'danger' | 'warning' }[] = [
    {
      label: 'Std./Einsatz',
      value: formatMinutes(calculation.minutes_per_visit),
      hint: 'inkl. Rüstzeit',
    },
    {
      label: 'Std./Monat',
      value: formatMinutes(calculation.monthly_minutes),
      hint: `${calculation.visits_per_week.toLocaleString('de-DE')}× pro Woche`,
    },
    {
      label: 'Kosten/Monat',
      value: formatMoney('de', calculation.total_cost_cents_month, calculation.currency),
      hint: `${formatMoney('de', calculation.total_cost_cents_visit, calculation.currency)} je Einsatz`,
    },
    {
      label: 'Verkaufspreis/Monat',
      value: formatMoney('de', calculation.selling_price_cents_month, calculation.currency),
      hint: calculation.price_override_cents_month != null ? 'manuell gesetzt' : 'aus Zielmarge',
    },
    {
      label: 'Deckungsbeitrag',
      value: formatMoney('de', calculation.contribution_cents_month, calculation.currency),
      hint: 'Preis − Kosten',
      tone: loss ? 'danger' : thin ? 'warning' : undefined,
    },
    {
      label: 'Marge',
      value: formatBp(calculation.margin_bp),
      hint: `Aufschlag ${formatBp(calculation.markup_bp)}`,
      tone: loss ? 'danger' : thin ? 'warning' : undefined,
    },
  ];

  return (
    <section aria-label="Wirtschaftlichkeit" className="mb-6">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border/80 bg-border/60 shadow-card sm:grid-cols-3 lg:grid-cols-6">
        {items.map((item) => (
          <div key={item.label} className="bg-card px-4 py-3.5">
            <dt className="text-xs font-medium text-muted-foreground">{item.label}</dt>
            <dd
              className={cn(
                'mt-1 text-[1.05rem] font-semibold tabular-nums leading-tight',
                item.tone === 'danger' && 'text-danger',
                item.tone === 'warning' && 'text-warning',
              )}
            >
              {item.value}
            </dd>
            {item.hint && <dd className="mt-0.5 text-xs text-muted-foreground">{item.hint}</dd>}
          </div>
        ))}
      </dl>

      {/*
        Said plainly rather than left for somebody to work out from a minus
        sign in a table. A contract at a loss is the single most expensive
        thing this screen can fail to communicate.
      */}
      {loss && (
        <p className="mt-2 rounded-lg border border-danger/25 bg-danger-soft px-3.5 py-2.5 text-sm leading-6 text-danger">
          Der Verkaufspreis liegt unter den kalkulierten Kosten. Bei diesem Preis macht der Auftrag
          jeden Monat {formatMoney('de', Math.abs(calculation.contribution_cents_month), calculation.currency)} Verlust.
        </p>
      )}
      {thin && (
        <p className="mt-2 rounded-lg border border-warning/25 bg-warning-soft px-3.5 py-2.5 text-sm leading-6 text-warning">
          Sehr geringe Marge. Mindeststundensatz zur Kostendeckung:{' '}
          <span className="font-semibold tabular-nums">
            {formatMoney('de', calculation.break_even_rate_cents_per_hour, calculation.currency)}
          </span>{' '}
          je produktiver Stunde.
        </p>
      )}
    </section>
  );
}
