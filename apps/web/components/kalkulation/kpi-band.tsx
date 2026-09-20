import { cn } from '@reinigung/ui';
import { formatMoney } from '@/lib/format';
import {
  formatBp,
  formatMinutes,
  incompleteReasonLabels,
  type Calculation,
} from '@/lib/data/kalkulation';

/**
 * The numbers an office actually decides on, kept visible while working
 * anywhere in the calculation.
 *
 * Margin and markup sit side by side deliberately. They are different
 * quantities computed from the same pair of figures, and treating them as
 * interchangeable is the most common way a small firm prices itself below
 * cost — a 30 % margin is a 42.9 % markup, and quoting "cost plus 30 %"
 * against a 30 % target loses money on every visit.
 *
 * Monthly and yearly sit side by side for the same reason. A contract is
 * argued about in monthly euros and lived with for a year, and 180 € a month
 * of contribution reads very differently as 2.160 € a year.
 */
export function CalculationKpiBand({ calculation }: { calculation: Calculation }) {
  const incomplete = calculation.incomplete_reasons.length > 0;
  const loss = calculation.contribution_cents_month < 0;
  const thin = !loss && calculation.margin_bp < 500 && calculation.selling_price_cents_month > 0;
  // A floor the company set for itself. Not enforced — a firm may knowingly go
  // below it — but never passed over in silence.
  const belowMinRate =
    calculation.min_hourly_rate_cents > 0 &&
    calculation.price_cents_per_productive_hour > 0 &&
    calculation.price_cents_per_productive_hour < calculation.min_hourly_rate_cents;

  const money = (cents: number) => formatMoney('de', cents, calculation.currency);

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
      value: money(calculation.total_cost_cents_month),
      hint: `${money(calculation.total_cost_cents_month * 12)} pro Jahr`,
    },
    {
      label: 'Verkaufspreis/Monat',
      value: money(calculation.selling_price_cents_month),
      hint:
        calculation.surcharge_cents_month > 0
          ? `inkl. ${money(calculation.surcharge_cents_month)} Zuschläge`
          : calculation.price_override_cents_month != null
            ? 'manuell gesetzt'
            : 'aus Zielmarge',
    },
    {
      label: 'Umsatz/Jahr',
      value: money(calculation.selling_price_cents_month * 12),
      hint: `${money(calculation.price_cents_per_productive_hour)} je produktiver Std.`,
      tone: belowMinRate ? 'warning' : undefined,
    },
    {
      label: 'Deckungsbeitrag',
      value: money(calculation.contribution_cents_month),
      hint: `${money(calculation.contribution_cents_month * 12)} pro Jahr`,
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
      {/*
        Said before the figures, not after. A margin computed from a missing
        wage is arithmetically impeccable and commercially meaningless, and the
        one thing this band must never do is let it pass as an answer.
      */}
      {incomplete && (
        <div className="mb-2 rounded-lg border border-info/25 bg-info-soft px-3.5 py-3 text-sm leading-6 text-info">
          <p className="font-medium">Diese Kalkulation ist noch unvollständig.</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {calculation.incomplete_reasons.map((reason) => (
              <li key={reason}>{incompleteReasonLabels[reason] ?? reason}</li>
            ))}
          </ul>
          <p className="mt-1.5">
            Die unten stehenden Zahlen beruhen auf den vorhandenen Angaben und sind noch keine
            belastbare Grundlage für ein Angebot.
          </p>
        </div>
      )}

      <dl
        className={cn(
          'grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border/80 bg-border/60 shadow-card sm:grid-cols-4 lg:grid-cols-7',
          incomplete && 'opacity-80',
        )}
      >
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
          jeden Monat {money(Math.abs(calculation.contribution_cents_month))} Verlust —{' '}
          {money(Math.abs(calculation.contribution_cents_month) * 12)} im Jahr.
        </p>
      )}
      {thin && (
        <p className="mt-2 rounded-lg border border-warning/25 bg-warning-soft px-3.5 py-2.5 text-sm leading-6 text-warning">
          Sehr geringe Marge. Mindeststundensatz zur Kostendeckung:{' '}
          <span className="font-semibold tabular-nums">
            {money(calculation.break_even_rate_cents_per_hour)}
          </span>{' '}
          je produktiver Stunde.
        </p>
      )}
      {belowMinRate && (
        <p className="mt-2 rounded-lg border border-warning/25 bg-warning-soft px-3.5 py-2.5 text-sm leading-6 text-warning">
          Der erzielte Stundensatz von{' '}
          <span className="font-semibold tabular-nums">
            {money(calculation.price_cents_per_productive_hour)}
          </span>{' '}
          liegt unter Ihrem eigenen Mindeststundensatz von{' '}
          <span className="font-semibold tabular-nums">{money(calculation.min_hourly_rate_cents)}</span>.
        </p>
      )}
    </section>
  );
}
