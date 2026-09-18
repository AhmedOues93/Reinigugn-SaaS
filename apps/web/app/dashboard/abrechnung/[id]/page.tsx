import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, FileText } from 'lucide-react';
import { Card } from '@/components/ui';
import { InvoiceStatusBadge } from '@/components/billing/invoice-status-badge';
import { InvoiceLineEditor } from '@/components/billing/invoice-line-editor';
import {
  CancelInvoiceAction,
  CorrectionInvoiceAction,
  IssueInvoiceAction,
  MarkPaidAction,
} from '@/components/billing/invoice-actions';
import { getInvoice, listBillableJobs } from '@/lib/data/billing';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import { t } from '@/lib/i18n';
import { currentLocale } from '@/lib/i18n-server';
import {
  addInvoiceLine,
  cancelInvoice,
  createCorrectionInvoice,
  issueInvoice,
  markInvoicePaid,
  removeInvoiceLine,
} from '../actions';

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [locale, invoice] = await Promise.all([currentLocale(), getInvoice(id)]);
  if (!invoice) notFound();

  const isDraft = invoice.status === 'DRAFT';
  const billableJobs = isDraft
    ? await listBillableJobs(
        invoice.customer_id,
        invoice.service_period_start,
        invoice.service_period_end,
      )
    : [];

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/dashboard/abrechnung"
        className="mb-5 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-slate-600"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
        {t(locale, 'billing.title')}
      </Link>

      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              {invoice.invoice_number ?? t(locale, 'billing.draft')}
            </h1>
            <InvoiceStatusBadge status={invoice.displayStatus} locale={locale} />
          </div>
          <p className="mt-2 text-slate-600">{invoice.customerName}</p>
        </div>
        {!isDraft && (
          <Link
            href={`/dashboard/abrechnung/${invoice.id}/dokument`}
            className="inline-flex min-h-11 items-center gap-2 rounded-md border bg-white px-4 text-sm font-medium hover:bg-slate-50"
          >
            <FileText className="size-4" aria-hidden="true" />
            {t(locale, 'billing.document')}
          </Link>
        )}
      </div>

      {invoice.corrects_invoice_id && (
        <p className="mb-5 rounded-md bg-blue-50 p-3 text-sm text-blue-900">
          Korrektur zu{' '}
          <Link className="underline" href={`/dashboard/abrechnung/${invoice.corrects_invoice_id}`}>
            der stornierten Rechnung
          </Link>
          .
        </p>
      )}
      {invoice.cancelled_at && (
        <p className="mb-5 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          Storniert am {formatDateTime(locale, invoice.cancelled_at)} ·{' '}
          {invoice.cancellation_reason}
        </p>
      )}

      <Card className="p-5">
        <dl className="grid gap-5 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-slate-500">{t(locale, 'billing.servicePeriod')}</dt>
            <dd className="mt-1 font-medium">
              {formatDate(locale, invoice.service_period_start)} –{' '}
              {formatDate(locale, invoice.service_period_end)}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">{t(locale, 'billing.issueDate')}</dt>
            <dd className="mt-1 font-medium">
              {invoice.issue_date ? formatDate(locale, invoice.issue_date) : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">{t(locale, 'billing.dueDate')}</dt>
            <dd className="mt-1 font-medium">
              {invoice.due_date ? formatDate(locale, invoice.due_date) : '—'}
            </dd>
          </div>
        </dl>
      </Card>

      <Card className="mt-5 p-5">
        <h2 className="mb-5 font-semibold">{t(locale, 'billing.lines')}</h2>
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
          <ul className="divide-y text-sm">
            {invoice.lines.map((line) => (
              <li
                key={line.id}
                className="flex flex-wrap items-baseline justify-between gap-3 py-3"
              >
                <span className="min-w-0">
                  {line.description}
                  <span className="ms-2 text-slate-500">
                    {line.quantity} {line.unit}
                  </span>
                </span>
                <span className="font-medium tabular-nums">
                  {formatMoney(locale, line.net_amount_cents, invoice.currency)}
                </span>
              </li>
            ))}
          </ul>
        )}

        <dl className="mt-6 space-y-2 border-t pt-4 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-600">{t(locale, 'billing.net')}</dt>
            <dd className="tabular-nums">
              {formatMoney(locale, invoice.net_total_cents, invoice.currency)}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-600">{t(locale, 'billing.vat')}</dt>
            <dd className="tabular-nums">
              {formatMoney(locale, invoice.vat_total_cents, invoice.currency)}
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-t pt-2 text-base font-semibold">
            <dt>{t(locale, 'billing.gross')}</dt>
            <dd className="tabular-nums">
              {formatMoney(locale, invoice.gross_total_cents, invoice.currency)}
            </dd>
          </div>
        </dl>
      </Card>

      <Card className="mt-5 p-5">
        {isDraft && (
          <IssueInvoiceAction
            action={issueInvoice.bind(null, invoice.id)}
            locale={locale}
            disabled={invoice.lines.length === 0}
          />
        )}
        {invoice.status === 'ISSUED' && (
          <div className="grid gap-6 sm:grid-cols-2">
            <MarkPaidAction action={markInvoicePaid.bind(null, invoice.id)} locale={locale} />
            <CancelInvoiceAction action={cancelInvoice.bind(null, invoice.id)} locale={locale} />
          </div>
        )}
        {invoice.status === 'PAID' && (
          <CancelInvoiceAction action={cancelInvoice.bind(null, invoice.id)} locale={locale} />
        )}
        {invoice.status === 'CANCELLED' && (
          <CorrectionInvoiceAction
            action={createCorrectionInvoice.bind(null, invoice.id)}
            locale={locale}
          />
        )}
      </Card>
    </div>
  );
}
