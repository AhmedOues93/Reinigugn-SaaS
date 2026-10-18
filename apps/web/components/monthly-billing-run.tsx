'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { FileText, TriangleAlert } from 'lucide-react';
import { runMonthlyBilling } from '@/app/dashboard/abrechnung/monatslauf/actions';
import { initialFormState } from '@/lib/actions';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { Badge, EmptyState } from '@/components/ui';
import {
  type BillingRunRow,
  outcomeLabel,
  outcomeTone,
  summarizeRun,
} from '@/lib/monthly-billing';

function euros(cents: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

export function MonthlyBillingRun({ month, rows }: { month: string; rows: BillingRunRow[] }) {
  const [state, action] = useActionState(runMonthlyBilling, initialFormState);
  const summary = summarizeRun(rows);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<FileText />}
        title="Keine aktiven Kunden"
        body="Der Monatslauf braucht mindestens einen aktiven Kunden mit einem Objekt und einem Vertrag."
      />
    );
  }

  return (
    <div className="min-w-0 space-y-4">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Kunden', value: String(summary.customers) },
          { label: 'Entwürfe', value: String(summary.invoices) },
          { label: 'Positionen', value: String(summary.lines) },
          { label: 'Netto', value: euros(summary.netTotalCents) },
        ].map((item) => (
          <div key={item.label} className="min-w-0 rounded-xl border border-border/80 bg-card p-3">
            <dt className="text-xs text-muted-foreground">{item.label}</dt>
            <dd className="mt-0.5 break-words text-lg font-semibold tabular-nums">{item.value}</dd>
          </div>
        ))}
      </dl>

      {summary.customersWithoutPrice > 0 ? (
        <p className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning-soft p-3 text-sm leading-5">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <span className="min-w-0">
            Bei {summary.customersWithoutPrice}{' '}
            {summary.customersWithoutPrice === 1 ? 'Kunden' : 'Kunden'} fehlt der Preis im Vertrag —{' '}
            {summary.skippedWithoutPrice}{' '}
            {summary.skippedWithoutPrice === 1 ? 'Leistung' : 'Leistungen'} bleiben liegen. Der Lauf rät
            keinen Preis.
          </span>
        </p>
      ) : null}

      <ul className="overflow-hidden rounded-xl border border-border/80">
        {rows.map((row) => (
          <li key={row.customerId} className="border-b border-border/70 px-4 py-3 last:border-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="min-w-0 break-words font-medium">{row.customerName}</span>
              <Badge tone={outcomeTone[row.outcome]}>{outcomeLabel[row.outcome]}</Badge>
            </div>
            {row.linesAdded > 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {row.linesAdded} {row.linesAdded === 1 ? 'Position' : 'Positionen'} ·{' '}
                <span className="tabular-nums">{euros(row.netTotalCents)}</span> netto
                {row.invoiceId ? (
                  <>
                    {' · '}
                    <Link
                      href={`/dashboard/abrechnung/${row.invoiceId}`}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      Entwurf öffnen
                    </Link>
                  </>
                ) : null}
              </p>
            ) : null}
            {row.reason ? (
              <p className="mt-1 break-words text-sm text-muted-foreground">{row.reason}</p>
            ) : null}
          </li>
        ))}
      </ul>

      <form action={action} className="space-y-3">
        <input type="hidden" name="month" value={month} />
        <FormMessage status={state.status} message={state.message} />
        <p className="text-sm leading-5 text-muted-foreground">
          Der Lauf legt nur Entwürfe an. Das Ausstellen bleibt ein eigener Schritt — jede Rechnung
          wird vorher geprüft.
        </p>
        <SubmitButton>Monatslauf ausführen</SubmitButton>
      </form>
    </div>
  );
}
