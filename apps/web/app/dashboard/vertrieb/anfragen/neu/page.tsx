import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Card, PageHeader } from '@/components/ui';
import { LeadForm } from '@/components/sales/lead-form';
import { t } from '@/lib/i18n';
import { currentLocale } from '@/lib/i18n-server';
import { createLead } from '../../actions';

export default async function NewLeadPage() {
  const locale = await currentLocale();
  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/dashboard/vertrieb/anfragen"
        className="mb-5 inline-flex min-h-touch items-center gap-2 text-sm font-medium text-muted-foreground"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
        {t(locale, 'sales.leads.title')}
      </Link>
      <PageHeader title={t(locale, 'sales.leads.new')} />
      <Card className="p-6">
        <LeadForm action={createLead} locale={locale} />
      </Card>
    </div>
  );
}
