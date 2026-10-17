import Link from 'next/link';
import { Download } from 'lucide-react';
import { CsvImportForm } from '@/components/csv-import-form';
import { BackLink, buttonVariants, Card, Notice, PageHeader } from '@/components/ui';
import { requireStaffCompany } from '@/lib/auth';
import { importObjectsCsv } from './actions';

export const metadata = { title: 'Objekte importieren · ReinPlan' };

export default async function ObjectImportPage() {
  await requireStaffCompany();

  return (
    <div className="mx-auto min-w-0 max-w-3xl">
      <BackLink href="/dashboard/objekte">Objekte</BackLink>
      <PageHeader
        title="Objekte zu bestehenden Kunden übernehmen"
        description="Für Kunden mit vielen Objekten: Vorlage herunterladen, Objektliste eintragen und als CSV hochladen."
        actions={
          <Link href="/dashboard/objekte/import/vorlage" className={buttonVariants({ variant: 'outline' })}>
            <Download className="size-4" aria-hidden="true" />
            Vorlage herunterladen
          </Link>
        }
      />

      <Notice tone="neutral" title="Kunden werden nicht angelegt">
        Der Import ordnet jedes Objekt einem vorhandenen Kunden zu — über die Kundennummer, sonst über
        den Namen. Ein Tippfehler im Namen würde sonst still einen zweiten Kunden erzeugen, und das
        merkt niemand, bis die Rechnung an die falsche Adresse geht. Zeilen ohne passenden Kunden
        werden gemeldet. Neue Kunden legst du über{' '}
        <Link href="/dashboard/kunden/import" className="font-medium text-primary underline-offset-4 hover:underline">
          Kunden importieren
        </Link>{' '}
        an.
      </Notice>

      <Card className="p-5 sm:p-6">
        <h2 className="mb-1 text-base font-semibold">CSV-Datei hochladen</h2>
        <p className="mb-5 text-sm leading-5 text-muted-foreground">
          Bis 1.000 Zeilen und 2 MB pro Import. Vorhandene Objekte werden übersprungen.
        </p>
        <CsvImportForm
          action={importObjectsCsv}
          id="object-import"
          hint={
            <>
              Pflicht sind <strong className="text-foreground">Objekt</strong> und{' '}
              <strong className="text-foreground">Kunde</strong> oder{' '}
              <strong className="text-foreground">Kundennummer</strong>. Optional: Objektnummer,
              Straße, PLZ, Ort, Fläche in qm, Ansprechpartner, Telefon, Zugang und Notizen.
            </>
          }
        />
      </Card>
    </div>
  );
}
