import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Building2, CalendarDays, FileDown, Users } from 'lucide-react';
import { BackLink, Badge, Card, CardHeader, DataRow, PageHeader } from '@/components/ui';
import { QuoteLineEditor } from '@/components/sales/quote-line-editor';
import { AcceptQuoteForm, DeclineQuoteForm, SendQuoteForm } from '@/components/sales/quote-actions';
import { getQuote, quoteStatusTone, type QuoteStatus } from '@/lib/data/sales';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import { t } from '@/lib/i18n';
import { currentLocale } from '@/lib/i18n-server';
import { acceptQuote, addQuoteLine, declineQuote, removeQuoteLine, sendQuote } from '../../actions';

function first<T>(value: T | T[] | null) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export default async function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [locale, quote] = await Promise.all([currentLocale(), getQuote(id)]);
  if (!quote) notFound();

  const owner = first(quote.customers)?.name ?? first(quote.leads)?.organisation ?? '—';
  const isDraft = quote.status === 'DRAFT';
  const hasRecurring = quote.lines.some((line) => line.recurrence !== 'ONE_OFF');

  return (
    <div className="mx-auto max-w-4xl">
      <BackLink href="/dashboard/vertrieb/angebote">{t(locale, 'sales.quotes.title')}</BackLink>

      <PageHeader
        title={quote.quote_number ?? t(locale, 'billing.draft')}
        description={`${owner} · ${quote.title}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {quote.status !== 'DRAFT' && (
              <a href={`/dashboard/vertrieb/angebote/${quote.id}/pdf`} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-muted">
                <FileDown className="size-4" aria-hidden="true" />
                PDF ansehen
              </a>
            )}
            <Badge tone={quoteStatusTone[quote.status as QuoteStatus]}>
              {t(locale, `sales.quote.status.${quote.status}`)}
            </Badge>
          </div>
        }
      />

      {quote.decline_reason && (
        <p className="mb-5 rounded-md bg-danger-soft p-3 text-sm text-danger">
          {t(locale, 'sales.quote.declineReason')}: {quote.decline_reason}
        </p>
      )}

      {/* Where the accepted quote landed — the provenance the whole workflow is for. */}
      {quote.status === 'ACCEPTED' && (
        <Card className="mb-5 border-success/30 bg-success-soft p-5">
          <p className="text-sm font-semibold text-success">
            Angebot angenommen · {formatDateTime(locale, quote.accepted_at!)}
          </p>
          <p className="mb-3 mt-1 text-sm text-success/80">
            Die Stammdaten wurden übernommen. Prüfen Sie jetzt Team und Einsatzplanung – Mitarbeiter werden nicht automatisch zugewiesen.
          </p>
          <div className="flex flex-wrap gap-2">
            {quote.created_customer_id && (
              <Link
                href={`/dashboard/kunden/${quote.created_customer_id}`}
                className="inline-flex min-h-touch items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-medium hover:bg-muted"
              >
                <Users className="size-4" aria-hidden="true" />
                {t(locale, 'nav.customers')}
              </Link>
            )}
            {quote.created_object_id && (
              <Link
                href={`/dashboard/objekte/${quote.created_object_id}`}
                className="inline-flex min-h-touch items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-medium hover:bg-muted"
              >
                <Building2 className="size-4" aria-hidden="true" />
                {t(locale, 'nav.objects')}
              </Link>
            )}
            {quote.created_schedule_id && (
              <Link
                href={`/dashboard/planung/plaene/${quote.created_schedule_id}`}
                className="inline-flex min-h-touch items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-medium hover:bg-muted"
              >
                <CalendarDays className="size-4" aria-hidden="true" />
                Einsatz planen
              </Link>
            )}
          </div>
        </Card>
      )}

      <Card className="p-5">
        <dl className="divide-y divide-border">
          {quote.sent_at && (
            <DataRow
              label={t(locale, 'sales.quote.status.SENT')}
              value={formatDateTime(locale, quote.sent_at)}
            />
          )}
          {quote.valid_until && (
            <DataRow
              label={t(locale, 'sales.quote.validUntil')}
              value={formatDate(locale, quote.valid_until)}
            />
          )}
          <DataRow
            label={t(locale, 'billing.net')}
            value={formatMoney(locale, quote.net_total_cents, quote.currency)}
          />
          <DataRow
            label={t(locale, 'billing.vat')}
            value={formatMoney(locale, quote.vat_total_cents, quote.currency)}
          />
          <DataRow
            label={t(locale, 'billing.gross')}
            value={
              <span className="text-base">
                {formatMoney(locale, quote.gross_total_cents, quote.currency)}
              </span>
            }
          />
          {quote.recurring_net_monthly_cents > 0 && (
            <DataRow
              label={t(locale, 'sales.quote.monthly')}
              value={formatMoney(locale, quote.recurring_net_monthly_cents, quote.currency)}
            />
          )}
        </dl>
      </Card>

      <Card className="mt-5 overflow-hidden">
        <CardHeader title={t(locale, 'billing.lines')} />
        <div className="p-5">
          <QuoteLineEditor
            locale={locale}
            currency={quote.currency}
            lines={quote.lines}
            editable={isDraft}
            addAction={addQuoteLine.bind(null, quote.id)}
            removeAction={removeQuoteLine.bind(null, quote.id)}
          />
        </div>
      </Card>

      <Card className="mt-5 p-5">
        {isDraft && (
          <SendQuoteForm
            action={sendQuote.bind(null, quote.id)}
            locale={locale}
            disabled={quote.lines.length === 0}
          />
        )}
        {quote.status === 'SENT' && (
          <div className="space-y-8">
            <AcceptQuoteForm
              action={acceptQuote.bind(null, quote.id)}
              locale={locale}
              showSchedule={hasRecurring}
            />
            <div className="border-t border-border pt-6">
              <DeclineQuoteForm action={declineQuote.bind(null, quote.id)} locale={locale} />
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
