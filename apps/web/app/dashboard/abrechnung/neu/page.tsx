import { BackLink, Card, PageHeader } from '@/components/ui';
import { DraftInvoiceForm } from '@/components/billing/draft-invoice-form';
import { getBillableJob, listBillingCustomers } from '@/lib/data/billing';
import { berlinDateKey } from '@/lib/date';
import { t } from '@/lib/i18n';
import { currentLocale } from '@/lib/i18n-server';
import { createDraftInvoice } from '../actions';

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ kunde?: string; einsatz?: string }>;
}) {
  const [{ kunde, einsatz }, locale, customers] = await Promise.all([
    searchParams,
    currentLocale(),
    listBillingCustomers(),
  ]);
  const today = berlinDateKey();
  const sourceJob = einsatz ? await getBillableJob(einsatz) : null;
  const preselectedCustomer = sourceJob?.customer_id ?? kunde;
  const preselected = customers.some((customer) => customer.id === preselectedCustomer)
    ? preselectedCustomer
    : undefined;
  const monthStart = sourceJob?.scheduled_date ?? `${today.slice(0, 7)}-01`;
  const periodEnd = sourceJob?.scheduled_date ?? today;

  return (
    <div className="mx-auto max-w-2xl">
      <BackLink href="/dashboard/abrechnung">{t(locale, 'billing.title')}</BackLink>
      <PageHeader
        title={t(locale, 'billing.new')}
        description={sourceJob
          ? 'Die erledigte Leistung und der vereinbarte Preis werden automatisch übernommen.'
          : 'Kunde und Leistungszeitraum wählen. Erledigte Leistungen können danach übernommen werden.'}
      />
      <Card className="p-5 sm:p-6">
        <DraftInvoiceForm
          action={createDraftInvoice}
          locale={locale}
          customers={customers}
          defaultPeriodStart={monthStart}
          defaultPeriodEnd={periodEnd}
          defaultCustomerId={preselected}
          sourceJobId={sourceJob?.job_id}
        />
      </Card>
    </div>
  );
}
