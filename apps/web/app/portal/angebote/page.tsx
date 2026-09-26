import { FileSignature } from 'lucide-react';
import { Badge, ButtonLink } from '@/components/ui';
import { PortalPageHeader } from '@/components/portal/portal-shell';
import { listPortalQuotes } from '@/lib/data/portal-quotes';
import { formatDate, formatMoney } from '@/lib/format';

const tone = {
  SENT: 'primary',
  ACCEPTED: 'success',
  DECLINED: 'danger',
  EXPIRED: 'warning',
} as const;

const label = {
  SENT: 'Offen',
  ACCEPTED: 'Angenommen',
  DECLINED: 'Abgelehnt',
  EXPIRED: 'Abgelaufen',
} as const;

export default async function PortalQuotesPage() {
  const quotes = await listPortalQuotes();

  return (
    <div>
      <PortalPageHeader title="Angebote" subtitle="Ihre Angebote und Annahmen." />

      {quotes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-foreground/15 px-5 py-10 text-center">
          <FileSignature className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 font-medium">Noch keine Angebote</p>
          <p className="mt-1 text-sm text-muted-foreground">Neue Angebote erscheinen hier nach dem Versand.</p>
        </div>
      ) : (
        <ul className="grid gap-3">
          {quotes.map((quote) => (
            <li key={quote.id} className="rounded-2xl border border-border/80 bg-card p-4 shadow-card sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{quote.quote_number}</p>
                    <Badge tone={tone[quote.status]}>{label[quote.status]}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{quote.title}</p>
                </div>
                <p className="text-base font-semibold tabular-nums">
                  {formatMoney('de', Number(quote.gross_total_cents), quote.currency)}
                </p>
              </div>

              <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-border/70 pt-4">
                <div className="text-xs leading-5 text-muted-foreground">
                  {quote.sent_at && <p>Gesendet: {formatDate('de', quote.sent_at)}</p>}
                  {quote.valid_until && <p>Gültig bis: {formatDate('de', quote.valid_until)}</p>}
                </div>
                <ButtonLink href={`/portal/angebote/${quote.id}`} variant="outline">
                  Ansehen
                </ButtonLink>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
