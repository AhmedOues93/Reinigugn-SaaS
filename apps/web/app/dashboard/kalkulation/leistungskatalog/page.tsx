import { SquareStack } from 'lucide-react';
import { BackLink, Card, EmptyState, PageHeader } from '@/components/ui';
import { CatalogItemEditor } from '@/components/kalkulation/catalog-editor';
import { costBasisLabels, listCatalogItems, unitLabels } from '@/lib/data/kalkulation';
import { formatMoney } from '@/lib/format';
import { saveCatalogItem } from '../actions';

/**
 * The company's own services and what each assumes about productivity.
 *
 * These are defaults, not rules. A calculation copies them at the moment it is
 * created, so changing a Richtleistung here affects the next calculation and
 * never an existing one — least of all one an offer already rests on.
 */
export default async function CatalogPage() {
  const items = await listCatalogItems(true);
  const grouped = new Map<string, typeof items>();
  for (const item of items) {
    const key = item.category ?? 'Ohne Kategorie';
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }

  return (
    <div className="mx-auto max-w-5xl">
      <BackLink href="/dashboard/kalkulation">Kalkulation</BackLink>
      <PageHeader
        title="Leistungskatalog"
        description="Ihre Leistungen mit Richtleistung und Materialansatz. Werte sind Erfahrungswerte und in jeder Kalkulation überschreibbar."
      />

      <p className="mb-5 rounded-lg border border-info/25 bg-info-soft px-3.5 py-3 text-sm leading-6 text-info">
        Eine Richtleistung ist ein Erfahrungswert Ihres Betriebs — abhängig von Ausstattung,
        Qualitätsanspruch und Objekt. Sie ersetzt keine Besichtigung, sondern macht deren Ergebnis
        rechenbar.
      </p>

      {items.length === 0 ? (
        <EmptyState
          icon={<SquareStack />}
          title="Noch keine Leistungen"
          body="Legen Sie die Leistungen an, die Sie regelmäßig anbieten — dann berechnet sich der Zeitbedarf aus den erfassten Flächen."
        />
      ) : (
        <div className="space-y-5">
          {[...grouped.entries()].map(([category, entries]) => (
            <Card key={category} className="overflow-hidden">
              <h2 className="px-4 pt-4 text-[15px] font-semibold sm:px-5">{category}</h2>
              <ul className="mt-3">
                {entries.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-border/70 px-4 py-3 last:border-0 sm:px-5"
                  >
                    <span className="min-w-0 font-medium">
                      {item.name}
                      {!item.is_active && (
                        <span className="ms-2 text-xs font-normal text-muted-foreground">archiviert</span>
                      )}
                    </span>
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {unitLabels[item.calculation_unit]}
                      {item.default_productivity_per_hour != null &&
                        ` · ${item.default_productivity_per_hour.toLocaleString('de-DE')} m²/h`}
                      {item.default_minutes_per_unit != null &&
                        ` · ${item.default_minutes_per_unit.toLocaleString('de-DE')} Min.`}
                      {item.default_material_cents > 0 &&
                        ` · Material ${formatMoney('de', item.default_material_cents)} ${costBasisLabels[item.default_material_basis]}`}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-6">
        <CatalogItemEditor action={saveCatalogItem.bind(null, null)} />
      </div>
    </div>
  );
}
