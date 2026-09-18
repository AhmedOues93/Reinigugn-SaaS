import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Card } from '@/components/ui';
import { DraftInvoiceForm } from '@/components/billing/draft-invoice-form';
import { listBillingCustomers } from '@/lib/data/billing';
import { berlinDateKey } from '@/lib/date';
import { t } from '@/lib/i18n';
import { currentLocale } from '@/lib/i18n-server';
import { createDraftInvoice } from '../actions';

export default async function NewInvoicePage() {
  const [locale, customers] = await Promise.all([currentLocale(), listBillingCustomers()]);
  const today = berlinDateKey();
  const monthStart = `${today.slice(0, 7)}-01`;

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/dashboard/abrechnung"
        className="mb-5 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-slate-600"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
        {t(locale, 'billing.title')}
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">{t(locale, 'billing.new')}</h1>
      <Card className="mt-6 p-6">
        <DraftInvoiceForm
          action={createDraftInvoice}
          locale={locale}
          customers={customers}
          defaultPeriodStart={monthStart}
          defaultPeriodEnd={today}
        />
      </Card>
    </div>
  );
}
