import { BackLink, Card, PageHeader } from '@/components/ui';
import { LeadForm } from '@/components/sales/lead-form';
import { listCustomerOptions } from '@/lib/data/customers';
import { t } from '@/lib/i18n';
import { currentLocale } from '@/lib/i18n-server';
import { createLead } from '../../actions';

export default async function NewLeadPage() {
  const [locale, customers] = await Promise.all([currentLocale(), listCustomerOptions()]);
  const activeCustomers = customers.filter((customer) => customer.is_active);

  return (
    <div className="mx-auto max-w-3xl">
      <BackLink href="/dashboard/vertrieb/anfragen">{t(locale, 'sales.leads.title')}</BackLink>
      <PageHeader
        title="Neue Anfrage"
        description="Kunde auswählen oder neuen Interessenten erfassen. Stammdaten werden nicht doppelt eingegeben."
      />
      <Card className="p-5 sm:p-7">
        <LeadForm action={createLead} locale={locale} customers={activeCustomers} />
      </Card>
    </div>
  );
}
