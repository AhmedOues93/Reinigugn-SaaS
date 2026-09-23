/* eslint-disable @next/next/no-img-element -- signed, short-lived storage URL */
import { formatDate, formatMoney, formatPercent } from '@/lib/format';
import { t, type Locale } from '@/lib/i18n';

export type InvoiceDocumentData = {
  invoiceNumber: string;
  status: string;
  issueDate: string | null;
  dueDate: string | null;
  servicePeriodStart: string;
  servicePeriodEnd: string;
  currency: string;
  netTotalCents: number;
  vatTotalCents: number;
  grossTotalCents: number;
  customerNote: string | null;
  buyerReference?: string | null;
  cancelledAt: string | null;
  customer: Record<string, string | null> | null;
  company: Record<string, string | null> | null;
  lines: {
    position: number;
    description: string;
    quantity: number;
    unit: string;
    unit_price_cents: number;
    vat_rate_basis_points: number;
    net_amount_cents: number;
    vat_amount_cents?: number;
  }[];
};

/**
 * The invoice document, rendered from the snapshots taken at issue time rather
 * than from live master data, so it always reproduces the document as issued.
 * It is laid out for A4 and prints (and therefore saves as PDF) directly from
 * the browser, which keeps the tenant logo and avoids a server-side renderer.
 */
export function InvoiceDocument({
  data,
  locale,
  logoUrl,
}: {
  data: InvoiceDocumentData;
  locale: Locale;
  logoUrl: string | null;
}) {
  const company = data.company ?? {};
  const customer = data.customer ?? {};
  const companyAddress = [
    company.street,
    [company.postal_code, company.city].filter(Boolean).join(' '),
    company.country,
  ]
    .filter(Boolean)
    .join(' · ');

  // VAT is summarised per rate, as a German invoice requires.
  // Summed from the stored line amounts so the rate lines always match the totals.
  const vatGroups = data.lines.reduce<Record<number, { net: number; vat: number }>>(
    (groups, line) => {
      const group = (groups[line.vat_rate_basis_points] ??= { net: 0, vat: 0 });
      group.net += line.net_amount_cents;
      group.vat +=
        line.vat_amount_cents ??
        Math.round((line.net_amount_cents * line.vat_rate_basis_points) / 10000);
      return groups;
    },
    {},
  );

  return (
    <article className="invoice-sheet mx-auto w-full max-w-[210mm] overflow-hidden bg-white p-5 text-[13px] leading-relaxed text-slate-900 shadow-sm sm:p-12 print:max-w-none print:p-0 print:shadow-none">
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={company.name ?? ''}
              className="max-h-16 max-w-[12rem] object-contain"
            />
          ) : (
            <p className="text-xl font-semibold tracking-tight">{company.name}</p>
          )}
        </div>
        <address className="text-end text-xs not-italic leading-5 text-slate-600">
          <span className="block font-medium text-slate-900">{company.name}</span>
          {company.street && <span className="block">{company.street}</span>}
          <span className="block">
            {company.postal_code} {company.city}
          </span>
          {company.phone && <span className="block">{company.phone}</span>}
          {company.email && <span className="block">{company.email}</span>}
        </address>
      </header>

      {data.cancelledAt && (
        <p className="mt-8 rounded border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-900">
          Storniert am {formatDate(locale, data.cancelledAt)}
        </p>
      )}

      <section className="mt-10 flex flex-wrap justify-between gap-8">
        <div>
          <p className="text-[10px] text-slate-500">{companyAddress}</p>
          <address className="mt-4 not-italic">
            <span className="block font-medium">{customer.name}</span>
            {customer.contact_person && <span className="block">{customer.contact_person}</span>}
            {customer.billing_address && <span className="block">{customer.billing_address}</span>}
            <span className="block">
              {customer.postal_code} {customer.city}
            </span>
          </address>
        </div>
        <dl className="text-sm">
          <div className="flex justify-between gap-8">
            <dt className="text-slate-500">{t(locale, 'billing.invoiceNumber')}</dt>
            <dd className="font-medium">{data.invoiceNumber}</dd>
          </div>
          {data.issueDate && (
            <div className="mt-1 flex justify-between gap-8">
              <dt className="text-slate-500">{t(locale, 'billing.issueDate')}</dt>
              <dd>{formatDate(locale, data.issueDate)}</dd>
            </div>
          )}
          {data.dueDate && (
            <div className="mt-1 flex justify-between gap-8">
              <dt className="text-slate-500">{t(locale, 'billing.dueDate')}</dt>
              <dd>{formatDate(locale, data.dueDate)}</dd>
            </div>
          )}
          {customer.customer_number && (
            <div className="mt-1 flex justify-between gap-8">
              <dt className="text-slate-500">Kundennummer</dt>
              <dd>{customer.customer_number}</dd>
            </div>
          )}
          {data.buyerReference && (
            <div className="mt-1 flex justify-between gap-8">
              <dt className="text-slate-500">Käuferreferenz</dt>
              <dd className="break-anywhere text-end">{data.buyerReference}</dd>
            </div>
          )}
        </dl>
      </section>

      <h1 className="mt-10 text-lg font-semibold">
        {t(locale, 'billing.invoice')} {data.invoiceNumber}
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        {t(locale, 'billing.servicePeriod')}: {formatDate(locale, data.servicePeriodStart)} –{' '}
        {formatDate(locale, data.servicePeriodEnd)}
      </p>

      {/* Line items. A real table from `sm` upwards and in print; a stacked list
          on a phone, because six numeric columns cannot fit 390px without
          forcing the whole page to scroll sideways. */}
      <ul className="mt-7 space-y-3 sm:hidden print:hidden">
        {data.lines.map((line) => (
          <li key={line.position} className="rounded-md border border-border p-3">
            <p className="break-anywhere text-sm font-medium">{line.description}</p>
            <dl className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t(locale, 'billing.quantity')}</dt>
                <dd className="tabular-nums">
                  {line.quantity} {line.unit}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t(locale, 'billing.unitPrice')}</dt>
                <dd className="tabular-nums">
                  {formatMoney(locale, line.unit_price_cents, data.currency)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t(locale, 'billing.vatRate')}</dt>
                <dd className="tabular-nums">
                  {formatPercent(locale, line.vat_rate_basis_points)}
                </dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-border pt-1 font-medium">
                <dt>{t(locale, 'billing.net')}</dt>
                <dd className="tabular-nums">
                  {formatMoney(locale, line.net_amount_cents, data.currency)}
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>

      <table className="mt-7 hidden w-full text-sm sm:table print:table">
        <thead>
          <tr className="border-b-2 border-slate-800 text-xs text-slate-500">
            <th className="py-2 text-start font-medium">Nr.</th>
            <th className="py-2 text-start font-medium">{t(locale, 'billing.lines')}</th>
            <th className="py-2 text-end font-medium">{t(locale, 'billing.quantity')}</th>
            <th className="py-2 text-end font-medium">{t(locale, 'billing.unitPrice')}</th>
            <th className="py-2 text-end font-medium">{t(locale, 'billing.vatRate')}</th>
            <th className="py-2 text-end font-medium">{t(locale, 'billing.net')}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {data.lines.map((line) => (
            <tr key={line.position}>
              <td className="py-2.5 align-top tabular-nums">{line.position}</td>
              <td className="py-2.5 align-top">{line.description}</td>
              <td className="py-2.5 text-end align-top tabular-nums">
                {line.quantity} {line.unit}
              </td>
              <td className="py-2.5 text-end align-top tabular-nums">
                {formatMoney(locale, line.unit_price_cents, data.currency)}
              </td>
              <td className="py-2.5 text-end align-top tabular-nums">
                {formatPercent(locale, line.vat_rate_basis_points)}
              </td>
              <td className="py-2.5 text-end align-top tabular-nums">
                {formatMoney(locale, line.net_amount_cents, data.currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-6 flex justify-end">
        <dl className="w-full max-w-xs space-y-1.5 text-sm">
          <div className="flex justify-between gap-6">
            <dt className="text-slate-600">{t(locale, 'billing.net')}</dt>
            <dd className="tabular-nums">
              {formatMoney(locale, data.netTotalCents, data.currency)}
            </dd>
          </div>
          {Object.entries(vatGroups).map(([rate, group]) => (
            <div key={rate} className="flex justify-between gap-6">
              <dt className="break-anywhere text-slate-600">
                {t(locale, 'billing.vat')} {formatPercent(locale, Number(rate))} ·{' '}
                {formatMoney(locale, group.net, data.currency)}
              </dt>
              <dd className="tabular-nums">{formatMoney(locale, group.vat, data.currency)}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-6 border-t-2 border-slate-800 pt-2 text-base font-semibold">
            <dt>{t(locale, 'billing.gross')}</dt>
            <dd className="tabular-nums">
              {formatMoney(locale, data.grossTotalCents, data.currency)}
            </dd>
          </div>
        </dl>
      </div>

      {data.customerNote && <p className="mt-8 whitespace-pre-wrap text-sm">{data.customerNote}</p>}
      {data.dueDate && !data.cancelledAt && (
        <p className="mt-6 text-sm">
          Bitte überweisen Sie den Gesamtbetrag bis zum {formatDate(locale, data.dueDate)}.
        </p>
      )}

      <footer className="mt-14 grid gap-4 border-t pt-5 text-[11px] leading-5 text-slate-600 sm:grid-cols-3">
        <div>
          <p className="font-medium text-slate-800">{company.name}</p>
          {company.legal_form && <p>{company.legal_form}</p>}
          {company.street && <p>{company.street}</p>}
          <p>
            {company.postal_code} {company.city}
          </p>
        </div>
        <div>
          {company.tax_number && <p>Steuernummer: {company.tax_number}</p>}
          {company.vat_id && <p>USt-IdNr.: {company.vat_id}</p>}
          {company.website && <p>{company.website}</p>}
        </div>
        <div>
          {company.iban && <p>IBAN: {company.iban}</p>}
          {company.bic && <p>BIC: {company.bic}</p>}
        </div>
      </footer>
    </article>
  );
}
