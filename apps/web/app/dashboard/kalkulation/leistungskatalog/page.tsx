import { SquareStack } from 'lucide-react';
import { BackLink, Card, EmptyState, PageHeader } from '@/components/ui';
import { CatalogItemEditor } from '@/components/kalkulation/catalog-editor';
import { costBasisLabels, listCatalogItems, unitLabels } from '@/lib/data/kalkulation';
import { formatMoney } from '@/lib/format';
import { archiveCatalogItem, saveCatalogItem } from '../actions';

/**
 * The company's own services and what each assumes about productivity.
 *
 * These are defaults, not rules. A calculation copies them at the moment it is
 * created, so changing a Richtleistung here affects the next calculation and
 * never an existing one — least of all one an offer already rests on.
 */
export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const { edit } = await searchParams;
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
        description="Ihre wiederverwendbaren Reinigungsleistungen. Sie liefern Zeit- und Materialvorgaben für neue Kalkulationen."
      />

      <p className="mb-5 rounded-lg border border-info/25 bg-info-soft px-3.5 py-3 text-sm leading-6 text-info">
        Beispiel: 250 m²/h bedeutet, dass 500 m² rechnerisch etwa 2 Arbeitsstunden benötigen.
        Der Katalog spart Tipparbeit: Bei einer Kalkulation werden diese Vorgaben übernommen und können
        für das konkrete Objekt angepasst werden.
      </p>

      {items.length === 0 ? (
        <EmptyState
          icon={<SquareStack />}
          title="Noch keine Leistungen"
          body="Hier fehlen noch Ihre Standardleistungen. Legen Sie z. B. Büro-, Sanitär- oder Glasreinigung an; danach kann die Kalkulation aus Fläche und Richtleistung automatisch den Zeitbedarf ableiten."
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
                    <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {unitLabels[item.calculation_unit]}
                      {item.default_productivity_per_hour != null &&
                        ` · ${item.default_productivity_per_hour.toLocaleString('de-DE')} m²/h`}
                      {item.default_minutes_per_unit != null &&
                        ` · ${item.default_minutes_per_unit.toLocaleString('de-DE')} Min.`}
                      {item.default_material_cents > 0 &&
                        ` · Material ${formatMoney('de', item.default_material_cents)} ${costBasisLabels[item.default_material_basis]}`}
                    </span>
                    <a href={`/dashboard/kalkulation/leistungskatalog?edit=${item.id}#leistung-editor`} className="inline-flex min-h-10 items-center rounded-md border border-border px-3 text-sm font-medium">Bearbeiten</a>
                    {item.is_active && <form action={archiveCatalogItem.bind(null, item.id)}><button className="min-h-10 rounded-md border border-border px-3 text-sm font-medium" type="submit">Archivieren</button></form>}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-6" id="leistung-editor">
        <CatalogItemEditor action={saveCatalogItem.bind(null, edit ?? null)} item={edit ? items.find((item) => item.id === edit) : undefined} />
      </div>
    </div>
  );
}
