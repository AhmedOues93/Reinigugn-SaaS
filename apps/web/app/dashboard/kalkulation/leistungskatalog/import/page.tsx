import Link from 'next/link';
import { Download } from 'lucide-react';
import { CsvImportForm } from '@/components/csv-import-form';
import { BackLink, buttonVariants, Card, Notice, PageHeader } from '@/components/ui';
import { requireStaffCompany } from '@/lib/auth';
import { importCatalogCsv } from './actions';

export const metadata = { title: 'Leistungskatalog importieren · ReinPlan' };

export default async function CatalogImportPage() {
  await requireStaffCompany();

  return (
    <div className="mx-auto min-w-0 max-w-3xl">
      <BackLink href="/dashboard/kalkulation/leistungskatalog">Leistungskatalog</BackLink>
      <PageHeader
        title="Leistungskatalog aus einer Preisliste übernehmen"
        description="Vorlage herunterladen, Leistungen mit Einheit und Leistungswerten eintragen und als CSV hochladen."
        actions={
          <Link
            href="/dashboard/kalkulation/leistungskatalog/import/vorlage"
            className={buttonVariants({ variant: 'outline' })}
          >
            <Download className="size-4" aria-hidden="true" />
            Vorlage herunterladen
          </Link>
        }
      />

      <Notice tone="neutral" title="Vorhandene Leistungen bleiben, wie sie sind">
        Eine Leistung, die es schon gibt, wird übersprungen und nicht überschrieben. Sie aus einer
        hochgeladenen Datei still zu ändern wäre eine Preisanpassung, die niemand beschlossen hat.
      </Notice>

      <Card className="p-5 sm:p-6">
        <h2 className="mb-1 text-base font-semibold">CSV-Datei hochladen</h2>
        <p className="mb-5 text-sm leading-5 text-muted-foreground">
          Bis 1.000 Zeilen und 2 MB pro Import.
        </p>
        <CsvImportForm
          action={importCatalogCsv}
          id="catalog-import"
          hint={
            <>
              Pflicht sind <strong className="text-foreground">Leistung</strong> und{' '}
              <strong className="text-foreground">Einheit</strong> (qm, Stunde, Stück, Einsatz,
              pauschal). Die Einheit wird nicht geraten: ob pro Quadratmeter oder pro Einsatz
              kalkuliert wird, zieht sich durch bis ins Angebot. Optional: Kategorie, Leistung pro
              Stunde, Minuten pro Einheit, Material und Materialbasis.
            </>
          }
        />
      </Card>
    </div>
  );
}
