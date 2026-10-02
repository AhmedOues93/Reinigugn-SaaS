'use server';

import { revalidatePath } from 'next/cache';
import { type FormState } from '@/lib/actions';
import { requireStaffCompany } from '@/lib/auth';
import { MAX_IMPORT_ROWS, readImportFile } from '@/lib/import/limits';
import { parseObjectImportCsv } from '@/lib/import/object-csv';

function key(value: string) {
  return value.trim().toLocaleLowerCase('de-DE');
}

/**
 * Objekte zu Kunden, die es schon gibt.
 *
 * Der Import legt keinen Kunden an. Das ist Absicht: ein Tippfehler im
 * Kundennamen wuerde sonst still einen zweiten Kunden erzeugen, und den
 * bemerkt niemand, bis die Rechnung an die falsche Adresse geht. Eine Zeile
 * ohne passenden Kunden wird gemeldet.
 */
export async function importObjectsCsv(_: FormState, formData: FormData): Promise<FormState> {
  const file = await readImportFile(formData.get('file'));
  if ('error' in file) return { status: 'error', message: file.error };

  let rows;
  try {
    rows = parseObjectImportCsv(file.text);
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
  const [customers, objects] = await Promise.all([
    supabase.from('customers').select('id,name,customer_number').eq('company_id', company.id),
    supabase.from('cleaning_objects').select('id,customer_id,name,object_number').eq('company_id', company.id),
  ]);
  if (customers.error || objects.error) {
    return { status: 'error', message: 'Vorhandene Kunden und Objekte konnten nicht geprüft werden.' };
  }

  const byNumber = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const customer of customers.data ?? []) {
    if (customer.customer_number) byNumber.set(key(customer.customer_number), customer.id);
    byName.set(key(customer.name), customer.id);
  }

  const existing = new Set<string>();
  for (const object of objects.data ?? []) {
    if (object.object_number) existing.add(`${object.customer_id}|number:${key(object.object_number)}`);
    existing.add(`${object.customer_id}|name:${key(object.name)}`);
  }

  const queued = new Set<string>();
  const toInsert = [];
  const unknownCustomers = new Set<string>();
  let duplicates = 0;

  for (const row of rows) {
    const customerId =
      (row.customerNumber ? byNumber.get(key(row.customerNumber)) : undefined) ??
      (row.customerName ? byName.get(key(row.customerName)) : undefined);
    if (!customerId) {
      unknownCustomers.add(row.customerNumber ?? row.customerName ?? '—');
      continue;
    }

    const objectKey = row.objectNumber
      ? `${customerId}|number:${key(row.objectNumber)}`
      : `${customerId}|name:${key(row.objectName)}`;
    if (existing.has(objectKey) || queued.has(objectKey)) {
      duplicates += 1;
      continue;
    }
    queued.add(objectKey);

    toInsert.push({
      company_id: company.id,
      customer_id: customerId,
      name: row.objectName,
      object_number: row.objectNumber,
      street: row.street,
      postal_code: row.postalCode,
      city: row.city,
      area_sqm: row.areaSqm,
      contact_person: row.contactPerson,
      contact_phone: row.contactPhone,
      access_instructions: row.accessInstructions,
      notes: row.notes,
    });
  }

  let created = 0;
  if (toInsert.length) {
    const { data, error } = await supabase.from('cleaning_objects').insert(toInsert).select('id');
    if (error || !data) {
      return { status: 'error', message: `Die Objekte konnten nicht angelegt werden: ${error?.message ?? 'unbekannter Fehler'}` };
    }
    created = data.length;
  }

  revalidatePath('/dashboard/objekte');

  const parts = [`${created} ${created === 1 ? 'Objekt' : 'Objekte'} neu angelegt`];
  if (duplicates) parts.push(`${duplicates} bereits vorhanden und übersprungen`);
  if (unknownCustomers.size) {
    parts.push(
      `${unknownCustomers.size} ohne passenden Kunden übersprungen (${[...unknownCustomers].slice(0, 5).join(', ')})`,
    );
  }

  return {
    status: created === 0 && unknownCustomers.size > 0 ? 'error' : 'success',
    message: `${parts.join(' · ')}.`,
  };
}
