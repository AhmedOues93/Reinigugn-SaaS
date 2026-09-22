import Link from 'next/link';
import { Download } from 'lucide-react';
import { CustomerImportForm } from '@/components/customer-import-form';
import { BackLink, buttonVariants, Card, PageHeader } from '@/components/ui';
import { requireStaffCompany } from '@/lib/auth';
import { importCustomersCsv } from './actions';

export default async function CustomerImportPage() {
  await requireStaffCompany();

  return (
    <div className="mx-auto max-w-3xl">
      <BackLink href="/dashboard/kunden">Kunden</BackLink>
      <PageHeader
        title="Kunden und Objekte importieren"
        description="Bestehende Stammdaten aus einer CSV übernehmen, ohne den normalen Workflow zu verändern."
        actions={
          <Link href="/dashboard/kunden/import/vorlage" className={buttonVariants({ variant: 'outline' })}>
            <Download className="size-4" aria-hidden="true" />
            CSV-Vorlage
          </Link>
        }
      />
      <Card className="p-5 sm:p-6">
        <CustomerImportForm action={importCustomersCsv} />
      </Card>
    </div>
  );
}
