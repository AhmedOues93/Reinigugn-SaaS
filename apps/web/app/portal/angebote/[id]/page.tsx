import { FileDown } from 'lucide-react';
import { notFound } from 'next/navigation';
import { Badge, ButtonLink } from '@/components/ui';
import { PortalPageHeader } from '@/components/portal/portal-shell';
import { PortalQuoteDecision } from '@/components/portal/quote-decision';
import { getPortalQuote } from '@/lib/data/portal-quotes';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import { acceptPortalQuote, declinePortalQuote } from '../actions';

const labels = {
  SENT: 'Offen',
  ACCEPTED: 'Angenommen',
  DECLINED: 'Abgelehnt',
  EXPIRED: 'Abgelaufen',
} as const;

export default async function PortalQuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const quote = await getPortalQuote(id);
  if (!quote) notFound();

  return (
    <div>
      <PortalPageHeader
        title={`Angebot ${quote.quote_number}`}
        subtitle={quote.title}
        actions={
          <ButtonLink href={`/portal/angebote/${quote.id}/pdf`} target="_blank" rel="noreferrer" variant="outline">
            <FileDown className="size-4" aria-hidden="true" />
            PDF ansehen
          </ButtonLink>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone={quote.status === 'ACCEPTED' ? 'success' : quote.status === 'SENT' ? 'primary' : quote.status === 'DECLINED' ? 'danger' : 'warning'}>
          {labels[quote.status as keyof typeof labels]}
        </Badge>
        {quote.valid_until && <span className="text-sm text-muted-foreground">Gültig bis {formatDate('de', quote.valid_until)}</span>}
      </div>

      <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-card sm:p-6">
        {quote.intro && <p className="mb-5 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{quote.intro}</p>}
        <div className="space-y-2">
          {quote.lines.map((line) => (
            <div key={`${line.position}-${line.description}`} className="flex items-start justify-between gap-4 border-b border-border/70 py-3 last:border-0">
              <div className="min-w-0">
                <p className="font-medium">{line.position}. {line.description}</p>
                <p className="mt-1 text-sm text-muted-foreground">{String(line.quantity)} {line.unit}</p>
              </div>
              <p className="shrink-0 font-medium tabular-nums">{formatMoney('de', Number(line.net_amount_cents), quote.currency)}</p>
            </div>
          ))}
        </div>

        <dl className="ms-auto mt-5 max-w-sm space-y-2 border-t border-border pt-4 text-sm">
          <div className="flex justify-between gap-4"><dt>Netto</dt><dd>{formatMoney('de', Number(quote.net_total_cents), quote.currency)}</dd></div>
          <div className="flex justify-between gap-4"><dt>Umsatzsteuer</dt><dd>{formatMoney('de', Number(quote.vat_total_cents), quote.currency)}</dd></div>
          <div className="flex justify-between gap-4 border-t border-border pt-2 text-base font-semibold"><dt>Gesamtbetrag</dt><dd>{formatMoney('de', Number(quote.gross_total_cents), quote.currency)}</dd></div>
        </dl>
      </section>

      {quote.status === 'ACCEPTED' && (
        <section className="mt-4 rounded-2xl border border-success/25 bg-card p-5 shadow-card">
          <h2 className="font-semibold">Annahme dokumentiert</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {quote.accepted_at ? formatDateTime('de', quote.accepted_at) : '—'}
            {quote.accepted_by_name ? ` · ${quote.accepted_by_name}` : ''}
          </p>
          {quote.acceptance_note && <p className="mt-3 text-sm">{quote.acceptance_note}</p>}
        </section>
      )}

      {quote.status === 'DECLINED' && (
        <section className="mt-4 rounded-2xl border border-danger/20 bg-card p-5 shadow-card">
          <h2 className="font-semibold">Angebot abgelehnt</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Ihre Entscheidung wurde gespeichert.
          </p>
          {quote.decline_reason && <p className="mt-3 rounded-lg bg-muted/40 p-3 text-sm">{quote.decline_reason}</p>}
        </section>
      )}

      {quote.status === 'SENT' && (
        <PortalQuoteDecision
          acceptAction={acceptPortalQuote.bind(null, quote.id)}
          declineAction={declinePortalQuote.bind(null, quote.id)}
        />
      )}
    </div>
  );
}
