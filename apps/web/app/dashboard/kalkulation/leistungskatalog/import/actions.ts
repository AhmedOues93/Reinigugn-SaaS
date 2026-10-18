'use server';

import { revalidatePath } from 'next/cache';
import { type FormState } from '@/lib/actions';
import { requireStaffCompany } from '@/lib/auth';
import { MAX_IMPORT_ROWS, readImportFile } from '@/lib/import/limits';
import { parseCatalogImportCsv } from '@/lib/import/catalog-csv';

/**
 * Den Leistungskatalog aus einer Preisliste uebernehmen.
 *
 * Eine Leistung, die es schon gibt, wird uebersprungen und nicht
 * ueberschrieben. Eine Kalkulation, die darauf aufbaut, hat ihre Werte beim
 * Anlegen kopiert -- aber der Katalog ist die Vorlage fuer die naechste, und
 * sie stillschweigend aus einer hochgeladenen Datei zu aendern waere eine
 * Preisanpassung, die niemand beschlossen hat.
 */
export async function importCatalogCsv(_: FormState, formData: FormData): Promise<FormState> {
  const file = await readImportFile(formData.get('file'));
  if ('error' in file) return { status: 'error', message: file.error };

  let rows;
  try {
    rows = parseCatalogImportCsv(file.text);
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Die CSV-Datei konnte nicht gelesen werden.',
    };
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    return { status: 'error', message: `Maximal ${MAX_IMPORT_ROWS} Datenzeilen pro Import.` };
  }

  const { supabase, company } = await requireStaffCompany();
  const { data: existing, error: loadError } = await supabase
    .from('service_catalog_items')
    .select('name')
    .eq('company_id', company.id);
  if (loadError) {
    return { status: 'error', message: 'Der vorhandene Leistungskatalog konnte nicht geprüft werden.' };
  }

  const known = new Set((existing ?? []).map((item) => item.name.trim().toLocaleLowerCase('de-DE')));
  let created = 0;
  let skipped = 0;
  const failed: string[] = [];

  for (const row of rows) {
    if (known.has(row.name.trim().toLocaleLowerCase('de-DE'))) {
      skipped += 1;
      continue;
    }
    const { error } = await supabase.rpc('save_catalog_item', {
      p_id: null,
      p_name: row.name,
      p_category: row.category,
      p_unit: row.unit,
      p_productivity: row.productivityPerHour,
      p_minutes_per_unit: row.minutesPerUnit,
      p_material_cents: row.materialCents,
      p_material_basis: row.materialBasis,
      p_description: row.description,
      p_is_active: true,
    });
    if (error) {
      failed.push(`${row.name} (${error.message})`);
      continue;
    }
    known.add(row.name.trim().toLocaleLowerCase('de-DE'));
    created += 1;
  }

  revalidatePath('/dashboard/kalkulation/leistungskatalog');

  const parts = [`${created} ${created === 1 ? 'Leistung' : 'Leistungen'} neu angelegt`];
  if (skipped) parts.push(`${skipped} bereits vorhanden und unverändert gelassen`);
  if (failed.length) parts.push(`${failed.length} fehlgeschlagen: ${failed.slice(0, 5).join(', ')}`);

  return {
    status: failed.length && created === 0 ? 'error' : 'success',
    message: `${parts.join(' · ')}.`,
  };
}
