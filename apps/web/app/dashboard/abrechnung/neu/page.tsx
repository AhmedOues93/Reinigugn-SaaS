import { BackLink, Card, PageHeader } from '@/components/ui';
import { DraftInvoiceForm } from '@/components/billing/draft-invoice-form';
import { listBillingCustomers } from '@/lib/data/billing';
import { berlinDateKey } from '@/lib/date';
import { t } from '@/lib/i18n';
import { currentLocale } from '@/lib/i18n-server';
import { createDraftInvoice } from '../actions';

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ kunde?: string }> }) {
  const [{ kunde }, locale, customers] = await Promise.all([searchParams, currentLocale(), listBillingCustomers()]);
  const today = berlinDateKey();
  const monthStart = `${today.slice(0, 7)}-01`;
  const preselected = customers.some((customer) => customer.id === kunde) ? kunde : undefined;

  return (
    <div className="mx-auto max-w-2xl">
      <BackLink href="/dashboard/abrechnung">{t(locale, 'billing.title')}</BackLink>
      <PageHeader
        title={t(locale, 'billing.new')}
        description="Kunde und Leistungszeitraum wählen – im nächsten Schritt übernehmen Sie die erledigten Einsätze als Positionen."
      />
      <Card className="p-5 sm:p-6">
        <DraftInvoiceForm
          action={createDraftInvoice}
          locale={locale}
          customers={customers}
          defaultPeriodStart={monthStart}
          defaultPeriodEnd={today}
          defaultCustomerId={preselected}
        />
      </Card>
    </div>
  );
}
