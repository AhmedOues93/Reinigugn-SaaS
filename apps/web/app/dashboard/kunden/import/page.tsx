import Link from 'next/link';
import { Download, FileSpreadsheet, ShieldCheck, Users } from 'lucide-react';
import { CustomerImportForm } from '@/components/customer-import-form';
import { BackLink, buttonVariants, Card, PageHeader } from '@/components/ui';
import { requireStaffCompany } from '@/lib/auth';
import { importCustomersCsv } from './actions';

export default async function CustomerImportPage() {
  await requireStaffCompany();

  return (
    <div className="mx-auto max-w-4xl">
      <BackLink href="/dashboard/kunden">Kunden</BackLink>
      <PageHeader
        title="Kunden und Objekte aus Excel übernehmen"
        description="Für bestehende Kundenlisten: Vorlage herunterladen, in Excel ausfüllen und als CSV hochladen. ReinPlan legt Kunden und ihre Objekte gesammelt an."
        actions={
          <Link href="/dashboard/kunden/import/vorlage" className={buttonVariants({ variant: 'outline' })}>
            <Download className="size-4" aria-hidden="true" />
            Vorlage herunterladen
          </Link>
        }
      />

      <div className="mb-5 grid gap-3 md:grid-cols-3">
        {[
          { icon: FileSpreadsheet, title: '1. Vorlage öffnen', text: 'CSV-Vorlage herunterladen und mit Excel oder LibreOffice öffnen.' },
          { icon: Users, title: '2. Daten eintragen', text: 'Pro Zeile einen Kunden; ein Objekt kann direkt in derselben Zeile stehen.' },
          { icon: ShieldCheck, title: '3. Sicher importieren', text: 'Bestehende Kunden und Objekte werden erkannt und nicht doppelt angelegt.' },
        ].map(({ icon: Icon, title, text }) => (
          <Card key={title} className="p-4">
            <Icon className="mb-3 size-5 text-primary" aria-hidden="true" />
            <h2 className="text-sm font-semibold">{title}</h2>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">{text}</p>
          </Card>
        ))}
      </div>

      <Card className="p-5 sm:p-6">
        <h2 className="mb-1 text-base font-semibold">CSV-Datei hochladen</h2>
        <p className="mb-5 text-sm text-muted-foreground">Bis 1.000 Zeilen und 2 MB pro Import. Der Import verändert keine bereits vorhandenen Datensätze.</p>
        <CustomerImportForm action={importCustomersCsv} />
      </Card>
    </div>
  );
}
