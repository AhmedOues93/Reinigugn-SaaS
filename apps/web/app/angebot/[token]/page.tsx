import { CheckCircle2, FileDown, ShieldCheck } from 'lucide-react';
import { notFound } from 'next/navigation';
import { Badge, Button, ButtonLink, Field, Input, Textarea } from '@/components/ui';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import { getPublicQuote } from '@/lib/data/public-quote';
import { acceptPublicQuote, declinePublicQuote } from './actions';

function snapshotValue(snapshot: Record<string, unknown> | null, key: string) {
  const value = snapshot?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export default async function PublicQuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ accepted?: string; declined?: string; error?: string }>;
}) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const quote = await getPublicQuote(token);
  if (!quote) notFound();

  const companyName = snapshotValue(quote.company_snapshot, 'name') ?? 'ReinPlan';
  const recipientName =
    snapshotValue(quote.recipient_snapshot, 'name') ??
    snapshotValue(quote.recipient_snapshot, 'organisation') ??
    'Kunde';
  const objectName = snapshotValue(quote.recipient_snapshot, 'object_name');
  const objectAddress = [
    snapshotValue(quote.recipient_snapshot, 'object_street'),
    [snapshotValue(quote.recipient_snapshot, 'object_postal_code'), snapshotValue(quote.recipient_snapshot, 'object_city')].filter(Boolean).join(' '),
  ].filter(Boolean).join(', ');
  const accepted = quote.status === 'ACCEPTED';
  const declined = quote.status === 'DECLINED';
  const expired =
    !accepted && !declined && Boolean(quote.valid_until) && new Date(`${quote.valid_until}T23:59:59+02:00`) < new Date();

  const errorText =
    query.error === 'name'
      ? 'Bitte geben Sie Ihren Namen an.'
        : query.error === 'note'
        ? 'Der Hinweis darf maximal 1.000 Zeichen enthalten.'
        : query.error === 'decline-note'
          ? 'Der Ablehnungsgrund darf maximal 1.000 Zeichen enthalten.'
          : query.error === 'decline'
            ? 'Das Angebot konnte nicht abgelehnt werden. Bitte laden Sie die Seite neu.'
            : query.error
              ? 'Das Angebot konnte nicht angenommen werden. Bitte laden Sie die Seite neu oder wenden Sie sich an den Anbieter.'
              : null;

  return (
    <main className="min-h-[100dvh] bg-muted/30 px-4 py-6 text-foreground sm:px-6 sm:py-10">
      <div className="mx-auto max-w-3xl">
        <header className="mb-5 rounded-2xl border border-border/80 bg-card p-5 shadow-card sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-primary">{companyName}</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
                Angebot {quote.quote_number}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Für {recipientName}
                {quote.valid_until ? ` · Gültig bis ${formatDate('de', quote.valid_until)}` : ''}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={accepted ? 'success' : declined ? 'danger' : expired ? 'warning' : 'primary'}>
                {accepted ? 'Angenommen' : declined ? 'Abgelehnt' : expired ? 'Abgelaufen' : 'Offen'}
              </Badge>
              <ButtonLink
                href={`/angebot/${encodeURIComponent(token)}/pdf`}
                target="_blank"
                rel="noreferrer"
                variant="outline"
              >
                <FileDown className="size-4" aria-hidden="true" />
                PDF ansehen
              </ButtonLink>
            </div>
          </div>
        </header>

        <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-card sm:p-7">
          <h2 className="text-lg font-semibold">{quote.title}</h2>
          {objectName && (
            <div className="mt-3 rounded-xl border border-border/80 bg-muted/20 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Objekt</p>
              <p className="mt-1 font-medium">{objectName}</p>
              {objectAddress && <p className="mt-1 text-sm text-muted-foreground">{objectAddress}</p>}
            </div>
          )}
          {quote.intro && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{quote.intro}</p>}

          {(quote.order_type || quote.service_start || quote.service_end || quote.termination_notice || quote.acceptance_policy) && (
            <div className="mt-4 grid gap-3 rounded-xl bg-muted/30 p-4 text-sm sm:grid-cols-2">
              {quote.order_type && (
                <div>
                  <p className="text-xs text-muted-foreground">Auftragsart</p>
                  <p className="mt-0.5 font-medium">
                    {quote.order_type === 'EINMALAUFTRAG'
                      ? 'Einmalauftrag'
                      : quote.order_type === 'BEFRISTET'
                        ? 'Befristeter Auftrag'
                        : 'Laufender Auftrag'}
                  </p>
                </div>
              )}
              {quote.service_start && (
                <div>
                  <p className="text-xs text-muted-foreground">Leistungsbeginn</p>
                  <p className="mt-0.5 font-medium">{formatDate('de', quote.service_start)}</p>
                </div>
              )}
              {quote.service_end && (
                <div>
                  <p className="text-xs text-muted-foreground">Vertragsende</p>
                  <p className="mt-0.5 font-medium">{formatDate('de', quote.service_end)}</p>
                </div>
              )}
              {quote.termination_notice && (
                <div>
                  <p className="text-xs text-muted-foreground">Kündigungsfrist</p>
                  <p className="mt-0.5 font-medium">{quote.termination_notice}</p>
                </div>
              )}
              {quote.acceptance_policy && (
                <div className="sm:col-span-2">
                  <p className="text-xs text-muted-foreground">Kundenabnahme</p>
                  <p className="mt-0.5 font-medium">
                    {quote.acceptance_policy === 'VOR_ORT_UNTERSCHRIFT'
                      ? 'Unterschrift vor Ort'
                      : quote.acceptance_policy === 'PORTAL_ABNAHME'
                        ? 'Bestätigung im Kundenportal'
                        : 'Keine gesonderte Abnahme erforderlich'}
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="mt-6 space-y-2">
            {quote.lines.map((line) => (
              <div key={`${line.position}-${line.description}`} className="rounded-xl border border-border/80 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium">{line.position}. {line.description}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {String(line.quantity)} {line.unit} · {formatMoney('de', Number(line.unit_price_cents), quote.currency)}
                    </p>
                  </div>
                  <p className="shrink-0 font-semibold tabular-nums">
                    {formatMoney('de', Number(line.net_amount_cents), quote.currency)}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <dl className="ms-auto mt-6 max-w-sm space-y-2 border-t border-border pt-4 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Netto</dt>
              <dd className="font-medium tabular-nums">{formatMoney('de', Number(quote.net_total_cents), quote.currency)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Umsatzsteuer</dt>
              <dd className="font-medium tabular-nums">{formatMoney('de', Number(quote.vat_total_cents), quote.currency)}</dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-border pt-2 text-base">
              <dt className="font-semibold">Gesamtbetrag</dt>
              <dd className="font-semibold tabular-nums">{formatMoney('de', Number(quote.gross_total_cents), quote.currency)}</dd>
            </div>
            {Number(quote.recurring_net_monthly_cents) > 0 && (
              <div className="flex justify-between gap-4 text-primary">
                <dt className="font-semibold">Monatlich netto</dt>
                <dd className="font-semibold tabular-nums">
                  {formatMoney('de', Number(quote.recurring_net_monthly_cents), quote.currency)}
                </dd>
              </div>
            )}
          </dl>
        </section>

        {accepted ? (
          <section className="mt-5 rounded-2xl border border-success/25 bg-card p-5 shadow-card sm:p-7">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-success" aria-hidden="true" />
              <div>
                <h2 className="text-lg font-semibold">Angebot angenommen</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Die Annahme wurde
                  {quote.accepted_at ? ` am ${formatDateTime('de', quote.accepted_at)}` : ''}
                  {quote.accepted_by_name ? ` durch ${quote.accepted_by_name}` : ''} dokumentiert.
                </p>
                {quote.acceptance_note && (
                  <p className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-sm">{quote.acceptance_note}</p>
                )}
              </div>
            </div>
          </section>
        ) : declined ? (
          <section className="mt-5 rounded-2xl border border-danger/20 bg-card p-5 shadow-card sm:p-7">
            <h2 className="font-semibold">Angebot abgelehnt</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Ihre Entscheidung wurde gespeichert.
            </p>
            {quote.decline_reason && <p className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-sm">{quote.decline_reason}</p>}
          </section>
        ) : expired ? (
          <section className="mt-5 rounded-2xl border border-border/80 bg-card p-5 shadow-card sm:p-7">
            <h2 className="font-semibold">Angebot abgelaufen</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Bitte wenden Sie sich an {companyName}, wenn Sie ein aktualisiertes Angebot benötigen.
            </p>
          </section>
        ) : (
          <section className="mt-5 rounded-2xl border border-border/80 bg-card p-5 shadow-card sm:p-7">
            <div className="mb-5 flex items-start gap-3">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <h2 className="font-semibold">Angebot digital annehmen</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Ihre Annahme wird mit Name und Zeitpunkt dokumentiert. Eine handschriftliche Unterschrift ist nicht erforderlich.
                </p>
              </div>
            </div>

            {(query.accepted || errorText) && (
              <p
                role={errorText ? 'alert' : 'status'}
                className={`mb-4 rounded-lg border px-3 py-2 text-sm ${errorText ? 'border-danger/20 text-danger' : 'border-success/20 text-success'}`}
              >
                {errorText ?? 'Vielen Dank. Ihre Annahme wurde gespeichert.'}
              </p>
            )}

            <form action={acceptPublicQuote.bind(null, token)} className="space-y-4">
              <Field label="Name" htmlFor="name">
                <Input id="name" name="name" required minLength={2} maxLength={160} autoComplete="name" />
              </Field>
              <p className="text-xs leading-5 text-muted-foreground">Mit der digitalen Annahme bestätigen Sie das Angebot verbindlich. Name und Zeitpunkt werden als Annahmenachweis dokumentiert.</p>
              <Field label="Hinweis" htmlFor="note" optional>
                <Textarea id="note" name="note" maxLength={1000} placeholder="Optionaler Hinweis zur Annahme" />
              </Field>
              <Button type="submit" size="block">Angebot verbindlich annehmen</Button>
            </form>

            <details className="mt-5 border-t border-border pt-5">
              <summary className="cursor-pointer text-sm font-medium text-muted-foreground">Angebot ablehnen</summary>
              <form action={declinePublicQuote.bind(null, token)} className="mt-4 space-y-4">
                <Field label="Grund" htmlFor="decline-reason" optional>
                  <Textarea id="decline-reason" name="reason" maxLength={1000} placeholder="Optionaler Grund für die Ablehnung" />
                </Field>
                <Button type="submit" variant="outline">Angebot ablehnen</Button>
              </form>
            </details>
          </section>
        )}

        <p className="mt-5 text-center text-xs text-muted-foreground">
          Bereitgestellt mit ReinPlan · Kundendokument
        </p>
      </div>
    </main>
  );
}
