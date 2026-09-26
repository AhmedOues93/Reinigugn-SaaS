import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Building2, Check, ClipboardCheck, Download, Eye, FileText } from 'lucide-react';
import { cn } from '@reinigung/ui';
import { BackLink, ButtonLink, buttonVariants, Card, DataRow, Notice } from '@/components/ui';
import { InvoiceStatusBadge } from '@/components/billing/invoice-status-badge';
import { InvoiceLineEditor } from '@/components/billing/invoice-line-editor';
import { CancelInvoiceAction, CorrectionInvoiceAction, IssueInvoiceAction } from '@/components/billing/invoice-actions';
import { AddAllBillableAction, MarkPaidForm, SendInvoicePanel } from '@/components/billing/invoice-delivery';
import {
  getCustomerBillingEmail,
  getInvoice,
  listBillableJobs,
  listInvoiceDeliveries,
  listInvoicePayments,
  type InvoiceDelivery,
  type InvoicePayment,
} from '@/lib/data/billing';
import { mailConfigured } from '@/lib/mail/transport';
import { xrechnungReadiness } from '@/lib/billing/invoice-xrechnung-data';
import { berlinDateKey } from '@/lib/date';
import { formatDate, formatDateTime, formatMoney, formatPercent } from '@/lib/format';
import { t } from '@/lib/i18n';
import { currentLocale } from '@/lib/i18n-server';
import { getCompanyProfile } from '@/lib/data/onboarding';
import {
  addAllBillableJobs,
  addInvoiceLine,
  cancelInvoice,
  createCorrectionInvoice,
  issueInvoice,
  markInvoicePaid,
  recordManualDelivery,
  removeInvoiceLine,
  sendInvoiceEmail,
  sendPaymentReminder,
} from '../actions';

const paymentMethodLabel: Record<InvoicePayment['method'], string> = {
  BANK_TRANSFER: 'Überweisung',
  CASH: 'Bar',
  CARD: 'Karte',
  DIRECT_DEBIT: 'Lastschrift',
  OTHER: 'Sonstiges',
};

const deliveryLabel: Record<InvoiceDelivery['status'], { text: string; tone: string }> = {
  SENT: { text: 'E-Mail zugestellt an Mailserver', tone: 'text-success' },
  MANUAL: { text: 'Manuell versendet', tone: 'text-success' },
  FAILED: { text: 'E-Mail fehlgeschlagen', tone: 'text-danger' },
  NOT_CONFIGURED: { text: 'Nicht gesendet – kein E-Mail-Versand eingerichtet', tone: 'text-warning' },
};

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [locale, invoice] = await Promise.all([currentLocale(), getInvoice(id)]);
  if (!invoice) notFound();

  const isDraft = invoice.status === 'DRAFT';
  const [billableJobs, deliveries, customerEmail, payments] = await Promise.all([
    isDraft ? listBillableJobs(invoice.customer_id, invoice.service_period_start, invoice.service_period_end) : Promise.resolve([]),
    isDraft ? Promise.resolve([]) : listInvoiceDeliveries(invoice.id),
    getCustomerBillingEmail(invoice.customer_id),
    isDraft ? Promise.resolve([]) : listInvoicePayments(invoice.id),
  ]);
  const paidSoFar = payments.reduce((sum, payment) => sum + payment.amount_cents, 0);
  const outstandingCents = invoice.gross_total_cents - paidSoFar;
  const snapshotEmail = (invoice.customer_snapshot as Record<string, string | null> | null)?.email ?? null;
  const recipient = customerEmail ?? snapshotEmail;
  const canMail = mailConfigured();
  const liveCompany = await getCompanyProfile();
  const xrechnung = xrechnungReadiness(invoice, liveCompany as Record<string, unknown> | null);
  const today = berlinDateKey();

  const steps = [
    { label: t(locale, 'billing.draft'), done: true, at: null as string | null },
    { label: t(locale, 'billing.issued'), done: !isDraft, at: invoice.issue_date },
    { label: t(locale, 'billing.sent'), done: Boolean(invoice.sent_at), at: invoice.sent_at },
    { label: t(locale, 'billing.paid'), done: invoice.status === 'PAID', at: invoice.paid_at },
  ];
  const current = steps.findIndex((step) => !step.done);
  const pdfHref = `/dashboard/abrechnung/${invoice.id}/pdf?download=1`;

  return (
    <div className="mx-auto max-w-6xl">
      <BackLink href="/dashboard/abrechnung">{t(locale, 'billing.title')}</BackLink>

      <header className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[1.75rem] font-semibold tabular-nums leading-tight">
              {invoice.invoice_number ?? 'Rechnungsentwurf'}
            </h1>
            <InvoiceStatusBadge status={invoice.displayStatus} locale={locale} />
          </div>
          <p className="mt-1.5 text-[15px] text-muted-foreground">
            <Link href={`/dashboard/kunden/${invoice.customer_id}`} className="font-medium text-foreground hover:text-primary hover:underline">
              {invoice.customerName}
            </Link>
            <span className="mx-2 text-border">/</span>
            {formatDate(locale, invoice.service_period_start)} – {formatDate(locale, invoice.service_period_end)}
          </p>
        </div>
        {!isDraft && (
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`/dashboard/abrechnung/${invoice.id}/dokument`} variant="outline">
              <Eye className="size-4" aria-hidden="true" />
              Vorschau
            </ButtonLink>
            <a href={pdfHref} className={buttonVariants()}>
              <Download className="size-4" aria-hidden="true" />
              PDF herunterladen
            </a>
            {xrechnung.ready && (
              <a
                href={`/dashboard/abrechnung/${invoice.id}/xrechnung`}
                className={buttonVariants({ variant: 'outline' })}
              >
                <FileText className="size-4" aria-hidden="true" />
                XRechnung XML
              </a>
            )}
          </div>
        )}
      </header>

      {/* Lifecycle. Cancelled invoices keep their history but show the stop. */}
      {invoice.status !== 'CANCELLED' ? (
        <ol className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border/80 bg-border/80 shadow-card sm:grid-cols-4" aria-label="Rechnungsverlauf">
          {steps.map((step, index) => (
            <li
              key={step.label}
              aria-current={index === current ? 'step' : undefined}
              className={cn('flex items-center gap-3 bg-card px-4 py-3.5', index === current && 'bg-primary-soft/50')}
            >
              <span
                className={cn(
                  'grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold',
                  step.done ? 'bg-primary text-primary-foreground' : index === current ? 'border-2 border-primary text-primary' : 'border border-border text-muted-foreground',
                )}
              >
                {step.done ? <Check className="size-3.5" aria-hidden="true" /> : index + 1}
              </span>
              <span className="min-w-0">
                <span className={cn('block text-sm font-medium', !step.done && index !== current && 'text-muted-foreground')}>{step.label}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {step.at ? formatDate(locale, step.at) : index === current ? t(locale, 'billing.nextStep') : '—'}
                </span>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <Notice tone="warning" title={`Storniert am ${formatDateTime(locale, invoice.cancelled_at!)}`} className="mb-8">
          {invoice.cancellation_reason}. Die Rechnung bleibt unverändert im Bestand; Korrekturen erfolgen über eine neue Korrekturrechnung.
        </Notice>
      )}

      {invoice.corrects_invoice_id && (
        <Notice tone="info" className="mb-6">
          Korrekturrechnung zu{' '}
          <Link className="font-medium underline" href={`/dashboard/abrechnung/${invoice.corrects_invoice_id}`}>
            der stornierten Rechnung
          </Link>
          .
        </Notice>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          {isDraft && billableJobs.length > 0 && (
            <AddAllBillableAction action={addAllBillableJobs.bind(null, invoice.id)} count={billableJobs.length} />
          )}

          <Card>
            <div className="flex items-center justify-between gap-3 border-b border-border/80 px-5 py-4">
              <h2 className="text-[15px] font-semibold">{t(locale, 'billing.lines')}</h2>
              <span className="text-sm text-muted-foreground">{invoice.lines.length} {invoice.lines.length === 1 ? 'Leistung' : 'Leistungen'}</span>
            </div>
            <div className="p-5">
              {isDraft ? (
                <InvoiceLineEditor
                  locale={locale}
                  currency={invoice.currency}
                  lines={invoice.lines}
                  billableJobs={billableJobs}
                  addAction={addInvoiceLine.bind(null, invoice.id)}
                  removeAction={removeInvoiceLine.bind(null, invoice.id)}
                />
              ) : (
                <ul className="divide-y divide-border/70">
                  {invoice.lines.map((line) => (
                    <li key={line.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 first:pt-0">
                      <span className="min-w-0 flex-1">
                        <span className="break-anywhere block text-sm font-medium">{line.description}</span>
                        <span className="block text-xs tabular-nums text-muted-foreground">
                          {line.quantity} {line.unit} × {formatMoney(locale, line.unit_price_cents, invoice.currency)} · USt. {formatPercent(locale, line.vat_rate_basis_points)}
                        </span>
                        {/* A billed visit is answerable: the proof of service is one
                            click away when a customer queries the line. */}
                        {line.job_id && (
                          <Link
                            href={`/dashboard/auftraege/${line.job_id}/leistungsnachweis`}
                            className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                          >
                            <ClipboardCheck className="size-3.5" aria-hidden="true" />
                            Leistungsnachweis
                          </Link>
                        )}
                      </span>
                      <span className="text-sm font-medium tabular-nums">{formatMoney(locale, line.net_amount_cents, invoice.currency)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <dl className="space-y-1.5 border-t border-border/80 bg-subtle px-5 py-4 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{t(locale, 'billing.net')}</dt>
                <dd className="tabular-nums">{formatMoney(locale, invoice.net_total_cents, invoice.currency)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{t(locale, 'billing.vat')}</dt>
                <dd className="tabular-nums">{formatMoney(locale, invoice.vat_total_cents, invoice.currency)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-border pt-2 text-base font-semibold">
                <dt>{t(locale, 'billing.gross')}</dt>
                <dd className="tabular-nums">{formatMoney(locale, invoice.gross_total_cents, invoice.currency)}</dd>
              </div>
            </dl>
          </Card>

          {!isDraft && (
            <section aria-labelledby="deliveries">
              <h2 id="deliveries" className="mb-3 text-[15px] font-semibold">
                {t(locale, 'billing.deliveryHistory')}
              </h2>
              {deliveries.length === 0 ? (
                <p className="rounded-xl border border-dashed border-foreground/15 px-4 py-5 text-sm text-muted-foreground">
                  Noch kein Versand. Die Rechnung ist seit der Festschreibung im Kundenportal sichtbar.
                </p>
              ) : (
                <ol className="space-y-0 overflow-hidden rounded-xl border border-border/80 bg-card shadow-card">
                  {deliveries.map((delivery) => (
                    <li key={delivery.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border/70 px-4 py-3 last:border-0">
                      <span className="min-w-0">
                        <span className={cn('block text-sm font-medium', deliveryLabel[delivery.status].tone)}>
                          {delivery.kind === 'REMINDER' ? `${delivery.reminder_level ?? '–'}. Mahnung: ` : ''}
                          {deliveryLabel[delivery.status].text}
                        </span>
                        <span className="break-anywhere block text-xs text-muted-foreground">
                          {[delivery.recipient, delivery.detail].filter(Boolean).join(' — ')}
                        </span>
                        {delivery.kind === 'REMINDER' && ((delivery.reminder_fee_cents ?? 0) > 0 || (delivery.reminder_interest_cents ?? 0) > 0) && (
                          <span className="mt-0.5 block text-xs tabular-nums text-muted-foreground">
                            {[
                              (delivery.reminder_fee_cents ?? 0) > 0 ? `Gebühr ${formatMoney(locale, delivery.reminder_fee_cents ?? 0, invoice.currency)}` : null,
                              (delivery.reminder_interest_cents ?? 0) > 0 ? `Zinsen ${formatMoney(locale, delivery.reminder_interest_cents ?? 0, invoice.currency)}` : null,
                            ].filter(Boolean).join(' · ')}
                          </span>
                        )}
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">{formatDateTime(locale, delivery.created_at)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24">
          <Card className="p-5">
            <h2 className="mb-4 text-[15px] font-semibold">
              {isDraft
                ? t(locale, 'billing.issue')
                : invoice.status === 'ISSUED'
                  ? invoice.sent_at
                    ? 'Zahlung erfassen'
                    : 'An Kunden senden'
                  : invoice.status === 'PAID'
                    ? 'Bezahlt'
                    : 'Korrektur'}
            </h2>
            {isDraft && (
              <IssueInvoiceAction action={issueInvoice.bind(null, invoice.id)} locale={locale} disabled={invoice.lines.length === 0} />
            )}
            {invoice.status === 'ISSUED' && !invoice.sent_at && (
              <div className="space-y-4">
                <SendInvoicePanel
                  sendAction={sendInvoiceEmail.bind(null, invoice.id)}
                  manualAction={recordManualDelivery.bind(null, invoice.id)}
                  defaultRecipient={recipient}
                  mailConfigured={canMail}
                />
                {/*
                  An invoice handed over in person can be paid before anyone
                  records it as sent. Tucked away, because sending first is the
                  normal order.
                */}
                <details className="border-t border-border pt-4">
                  <summary className="cursor-pointer list-none text-sm font-medium text-primary underline-offset-4 hover:underline">
                    Zahlung bereits eingegangen?
                  </summary>
                  <div className="pt-3">
                    <MarkPaidForm
                      action={markInvoicePaid.bind(null, invoice.id)}
                      today={today}
                      outstanding={formatMoney(locale, outstandingCents, invoice.currency)}
                      partiallyPaid={paidSoFar > 0}
                    />
                  </div>
                </details>
              </div>
            )}
            {invoice.status === 'ISSUED' && invoice.sent_at && (
              <div className="space-y-5">
                <MarkPaidForm
                  action={markInvoicePaid.bind(null, invoice.id)}
                  today={today}
                  outstanding={formatMoney(locale, outstandingCents, invoice.currency)}
                  partiallyPaid={paidSoFar > 0}
                />
                {invoice.displayStatus === 'OVERDUE' && (
                  <div className="border-t border-border pt-5">
                    <p className="mb-3 text-sm font-medium text-danger">
                      Seit {formatDate(locale, invoice.due_date!)} überfällig
                      {invoice.reminder_count > 0 && ` · ${invoice.reminder_count}/3 Mahnstufen dokumentiert`}
                    </p>
                    {invoice.reminder_count < 3 ? (
                      <SendInvoicePanel
                        kind="REMINDER"
                        reminderLevel={(invoice.reminder_count + 1) as 1 | 2 | 3}
                        sendAction={sendPaymentReminder.bind(null, invoice.id)}
                        manualAction={recordManualDelivery.bind(null, invoice.id)}
                        defaultRecipient={recipient}
                        mailConfigured={canMail}
                      />
                    ) : (
                      <p className="rounded-lg border border-border bg-subtle px-3.5 py-3 text-sm leading-6 text-muted-foreground">
                        Alle drei Mahnstufen sind dokumentiert. Weitere Schritte werden außerhalb des automatischen Mahnlaufs entschieden.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
            {invoice.status === 'PAID' && (
              <p className="flex items-center gap-2 text-sm text-success">
                <Check className="size-4" aria-hidden="true" />
                Zahlungseingang am {formatDate(locale, invoice.paid_at!)}
              </p>
            )}
            {invoice.status === 'ISSUED' && paidSoFar > 0 && (
              <p className="mt-4 rounded-lg border border-warning/25 bg-warning-soft px-3.5 py-3 text-sm leading-6 text-warning">
                Teilzahlung von {formatMoney(locale, paidSoFar, invoice.currency)} verbucht.
                Offen: <span className="font-semibold tabular-nums">{formatMoney(locale, outstandingCents, invoice.currency)}</span>
              </p>
            )}
            {invoice.status === 'CANCELLED' && (
              <CorrectionInvoiceAction action={createCorrectionInvoice.bind(null, invoice.id)} locale={locale} />
            )}
          </Card>

          {!isDraft && !xrechnung.ready && (
            <details className="rounded-xl border border-border/80 bg-card px-5 py-3 shadow-card">
              <summary className="cursor-pointer list-none text-sm font-medium">
                XRechnung noch nicht vollständig
              </summary>
              <div className="pt-3">
                {/*
                  Nicht mehr „zusätzlich": seit 2025 ist die E-Rechnung im
                  deutschen B2B die geforderte Form, und der Versand ist ohne
                  sie gesperrt. Der Hinweis führt jetzt dorthin, wo sich der
                  Mangel beheben lässt — eine Liste ohne Weg dahin lässt
                  jemanden suchen.
                */}
                <p className="text-sm leading-6 text-muted-foreground">
                  Für die maschinenlesbare XRechnung (XML) fehlen noch folgende Angaben. Ohne sie kann die Rechnung
                  nicht per E-Mail versendet werden.
                </p>
                <ul className="mt-2 list-disc space-y-1 ps-5 text-sm text-muted-foreground">
                  {xrechnung.errors.map((error) => <li key={error}>{error}</li>)}
                </ul>
                <ButtonLink href="/dashboard/settings" variant="outline" size="sm" className="mt-4">
                  <Building2 className="size-4 shrink-0" aria-hidden="true" />
                  Unternehmensdaten öffnen
                </ButtonLink>
              </div>
            </details>
          )}

          <Card className="px-5 py-2">
            <dl className="divide-y divide-border/70">
              <DataRow label={t(locale, 'billing.issueDate')} value={invoice.issue_date ? formatDate(locale, invoice.issue_date) : '—'} />
              <DataRow label={t(locale, 'billing.dueDate')} value={invoice.due_date ? formatDate(locale, invoice.due_date) : `${invoice.payment_terms_days} Tage nach Ausstellung`} />
              <DataRow label={t(locale, 'billing.sent')} value={invoice.sent_at ? formatDate(locale, invoice.sent_at) : '—'} />
              <DataRow label={t(locale, 'billing.portal')} value={isDraft ? t(locale, 'billing.notVisibleDraft') : t(locale, 'billing.visible')} />
            </dl>
          </Card>

          {invoice.status === 'ISSUED' && invoice.sent_at && (
            <details className="group rounded-xl border border-border/80 bg-card px-5 py-3 shadow-card">
              <summary className="flex min-h-touch cursor-pointer list-none items-center justify-between text-sm font-medium md:min-h-9">
                Erneut senden
                <FileText className="size-4 text-muted-foreground" aria-hidden="true" />
              </summary>
              <div className="pb-2 pt-3">
                <SendInvoicePanel
                  sendAction={sendInvoiceEmail.bind(null, invoice.id)}
                  manualAction={recordManualDelivery.bind(null, invoice.id)}
                  defaultRecipient={recipient}
                  mailConfigured={canMail}
                />
              </div>
            </details>
          )}

          {/*
            The audit trail behind the green badge: what arrived, when, how, and
            who booked it. Without this, "why is this marked paid?" has no
            answer and a mistake cannot be traced.
          */}
          {payments.length > 0 && (
            <Card className="p-5">
              <h2 className="mb-3 text-[15px] font-semibold">Zahlungseingänge</h2>
              <ol className="space-y-3">
                {payments.map((payment) => (
                  <li key={payment.id} className="border-l-2 border-success/40 pl-3 text-sm leading-6">
                    <p className="font-semibold tabular-nums">
                      {formatMoney(locale, payment.amount_cents, payment.currency)}
                      <span className="ml-2 font-normal text-muted-foreground">
                        am {formatDate(locale, payment.paid_on)}
                      </span>
                    </p>
                    <p className="text-muted-foreground">
                      {paymentMethodLabel[payment.method]}
                      {payment.reference && ` · ${payment.reference}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Erfasst von {payment.recorded_by_name} am {formatDateTime(locale, payment.created_at)}
                    </p>
                  </li>
                ))}
              </ol>
            </Card>
          )}

          {(invoice.status === 'ISSUED' || invoice.status === 'PAID') && (
            <div className="px-1">
              <CancelInvoiceAction action={cancelInvoice.bind(null, invoice.id)} locale={locale} />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
