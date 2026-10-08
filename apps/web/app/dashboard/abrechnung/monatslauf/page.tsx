import Link from 'next/link';
import { BackLink, Notice, PageHeader, Section } from '@/components/ui';
import { MonthlyBillingRun } from '@/components/monthly-billing-run';
import { previewMonthlyBilling } from '@/lib/data/monthly-billing';
import { type BillingRunRow, isClosedMonth, lastClosedMonth } from '@/lib/monthly-billing';
import { requireStaffCompany } from '@/lib/auth';

export const metadata = { title: 'Monatslauf · ReinPlan' };

/**
 * Sammelrechnung: aus einem Monat erledigter Arbeit je Kunde ein Entwurf.
 *
 * Die Seite zeigt zuerst, was der Lauf tun wuerde, und laesst ihn erst dann
 * laufen. Am Monatsende hundert Rechnungen blind entstehen zu lassen waere die
 * eine Art Bequemlichkeit, die teuer wird.
 */
export default async function MonthlyBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ monat?: string }>;
}) {
  await requireStaffCompany();
  const params = await searchParams;
  const requested = params.monat ?? '';
  const month = isClosedMonth(requested) ? requested : lastClosedMonth();
  const label = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' })
    .format(new Date(`${month}-01T00:00:00Z`));

  let rows: BillingRunRow[];
  let failure: string | null = null;
  try {
    rows = await previewMonthlyBilling(month);
  } catch (error) {
    rows = [];
    failure = error instanceof Error ? error.message : 'Die Vorschau konnte nicht geladen werden.';
  }

  return (
    <div className="mx-auto min-w-0 max-w-3xl">
      <BackLink href="/dashboard/abrechnung">Abrechnung</BackLink>
      <PageHeader
        title="Monatslauf"
        description={`Vorschau für ${label}. Je Kunde ein Rechnungsentwurf aus allen abgenommenen Leistungen des Monats.`}
      />

      {requested && !isClosedMonth(requested) ? (
        <Notice tone="neutral" title="Noch nicht abgeschlossen">
          {requested} läuft noch. Abgerechnet wird erst, wenn der Monat vorbei ist — sonst fehlen die
          letzten Einsätze und der Kunde bekommt zwei Rechnungen für denselben Monat.
        </Notice>
      ) : null}

      {failure ? (
        <Notice tone="danger" title="Vorschau nicht möglich">
          {failure}
        </Notice>
      ) : (
        <Section title={label} description="Was der Lauf tun würde.">
          <MonthlyBillingRun month={month} rows={rows} />
        </Section>
      )}

      <p className="mt-6 text-sm text-muted-foreground">
        Ein anderer Monat:{' '}
        <Link
          href={`/dashboard/abrechnung/monatslauf?monat=${lastClosedMonth(new Date(`${month}-01T00:00:00Z`))}`}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          vorheriger Monat
        </Link>
      </p>
    </div>
  );
}
