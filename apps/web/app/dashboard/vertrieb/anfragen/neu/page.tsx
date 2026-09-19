import { BackLink, Card, PageHeader } from '@/components/ui';
import { LeadForm } from '@/components/sales/lead-form';
import { t } from '@/lib/i18n';
import { currentLocale } from '@/lib/i18n-server';
import { createLead } from '../../actions';

export default async function NewLeadPage() {
  const locale = await currentLocale();
  return (
    <div className="mx-auto max-w-2xl">
      <BackLink href="/dashboard/vertrieb/anfragen">{t(locale, 'sales.leads.title')}</BackLink>
      <PageHeader title={t(locale, 'sales.leads.new')} />
      <Card className="p-6">
        <LeadForm action={createLead} locale={locale} />
      </Card>
    </div>
  );
}
