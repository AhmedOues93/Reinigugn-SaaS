import Link from 'next/link';
import { Download } from 'lucide-react';
import { CsvImportForm } from '@/components/csv-import-form';
import { BackLink, buttonVariants, Card, Notice, PageHeader } from '@/components/ui';
import { requireStaffCompany } from '@/lib/auth';
import { importEmployeesCsv } from './actions';

export const metadata = { title: 'Mitarbeiter importieren · ReinPlan' };

export default async function EmployeeImportPage() {
  await requireStaffCompany();

  return (
    <div className="mx-auto min-w-0 max-w-3xl">
      <BackLink href="/dashboard/mitarbeiter">Mitarbeiter</BackLink>
      <PageHeader
        title="Mitarbeiter aus einer Personalliste übernehmen"
        description="Für den Umstieg: Vorlage herunterladen, Personalliste eintragen und als CSV hochladen."
        actions={
          <Link href="/dashboard/mitarbeiter/import/vorlage" className={buttonVariants({ variant: 'outline' })}>
            <Download className="size-4" aria-hidden="true" />
            Vorlage herunterladen
          </Link>
        }
      />

      <Notice tone="neutral" title="Es wird keine E-Mail versendet">
        Der Import legt die Einladungen an, verschickt aber nichts. Eine Datei hochzuladen und damit
        vierzig Menschen anzuschreiben wäre eine Nebenwirkung, die niemand erwartet. Versendet wird
        einzeln in der Mitarbeiterliste.
      </Notice>

      <Card className="p-5 sm:p-6">
        <h2 className="mb-1 text-base font-semibold">CSV-Datei hochladen</h2>
        <p className="mb-5 text-sm leading-5 text-muted-foreground">
          Bis 1.000 Zeilen und 2 MB pro Import. Vorhandene Mitarbeiter werden übersprungen.
        </p>
        <CsvImportForm
          action={importEmployeesCsv}
          id="employee-import"
          hint={
            <>
              Pflicht sind <strong className="text-foreground">Vorname</strong>,{' '}
              <strong className="text-foreground">Nachname</strong> und{' '}
              <strong className="text-foreground">E-Mail</strong>. Optional: Telefon, Personalnummer,
              Wochenstunden, Lohngruppe, Stundenlohn, Eintritt (TT.MM.JJJJ) und Beschäftigung
              (Vollzeit, Teilzeit, Minijob, Sonstige).
            </>
          }
        />
      </Card>
    </div>
  );
}
