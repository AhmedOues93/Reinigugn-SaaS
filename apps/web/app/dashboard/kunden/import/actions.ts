'use server';

import { revalidatePath } from 'next/cache';
import { type FormState } from '@/lib/actions';
import { requireStaffCompany } from '@/lib/auth';
import { parseCustomerImportCsv } from '@/lib/import/customer-csv';

const MAX_FILE_SIZE = 2 * 1024 * 1024;
const MAX_ROWS = 1000;

function key(value: string) {
  return value.trim().toLocaleLowerCase('de-DE');
}

export async function importCustomersCsv(_: FormState, formData: FormData): Promise<FormState> {
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { status: 'error', message: 'Bitte wähle eine CSV-Datei aus.' };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { status: 'error', message: 'Die CSV-Datei darf höchstens 2 MB groß sein.' };
  }

  let rows;
  try {
    rows = parseCustomerImportCsv(await file.text());
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : 'Die CSV-Datei konnte nicht gelesen werden.' };
  }

  if (rows.length > MAX_ROWS) {
    return { status: 'error', message: `Maximal ${MAX_ROWS} Datenzeilen pro Import.` };
  }

  try {
    const { supabase, company } = await requireStaffCompany();
    const [{ data: existingCustomers, error: customerLoadError }, { data: existingObjects, error: objectLoadError }] = await Promise.all([
      supabase
        .from('customers')
        .select('id,name,customer_number')
        .eq('company_id', company.id),
      supabase
        .from('cleaning_objects')
        .select('id,customer_id,name,object_number')
        .eq('company_id', company.id),
    ]);

    if (customerLoadError || objectLoadError) {
      return { status: 'error', message: 'Vorhandene Kunden und Objekte konnten nicht geprüft werden.' };
    }

    const byNumber = new Map<string, string>();
    const byName = new Map<string, string>();
    for (const customer of existingCustomers ?? []) {
      if (customer.customer_number) byNumber.set(key(customer.customer_number), customer.id);
      byName.set(key(customer.name), customer.id);
    }

    const firstRowByCustomer = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      const importKey = row.customerNumber ? `number:${key(row.customerNumber)}` : `name:${key(row.customerName)}`;
      if (!firstRowByCustomer.has(importKey)) firstRowByCustomer.set(importKey, row);
    }

    const toInsert = [...firstRowByCustomer.values()].filter((row) => {
      if (row.customerNumber && byNumber.has(key(row.customerNumber))) return false;
      if (!row.customerNumber && byName.has(key(row.customerName))) return false;
      return true;
    }).map((row) => ({
      company_id: company.id,
      name: row.customerName,
      customer_number: row.customerNumber,
      email: row.email,
      phone: row.phone,
      billing_address: row.billingAddress,
      postal_code: row.postalCode,
      city: row.city,
      datev_debtor_account: row.datevDebtorAccount,
    }));

    let createdCustomers = 0;
    if (toInsert.length) {
      const { data: inserted, error } = await supabase
        .from('customers')
        .insert(toInsert)
        .select('id,name,customer_number');
      if (error || !inserted) return { status: 'error', message: 'Kunden konnten nicht importiert werden.' };
      createdCustomers = inserted.length;
      for (const customer of inserted) {
        if (customer.customer_number) byNumber.set(key(customer.customer_number), customer.id);
        byName.set(key(customer.name), customer.id);
      }
    }

    const existingObjectKeys = new Set<string>();
    for (const object of existingObjects ?? []) {
      if (object.object_number) existingObjectKeys.add(`${object.customer_id}|number:${key(object.object_number)}`);
      existingObjectKeys.add(`${object.customer_id}|name:${key(object.name)}`);
    }

    const newObjects = [];
    const queuedObjectKeys = new Set<string>();
    for (const row of rows) {
      if (!row.objectName) continue;
      const customerId = row.customerNumber
        ? byNumber.get(key(row.customerNumber))
        : byName.get(key(row.customerName));
      if (!customerId) continue;

      const objectKey = row.objectNumber
        ? `${customerId}|number:${key(row.objectNumber)}`
        : `${customerId}|name:${key(row.objectName)}`;

      if (existingObjectKeys.has(objectKey) || queuedObjectKeys.has(objectKey)) continue;
      queuedObjectKeys.add(objectKey);
      newObjects.push({
        company_id: company.id,
        customer_id: customerId,
        name: row.objectName,
        object_number: row.objectNumber,
        street: row.objectStreet,
        postal_code: row.objectPostalCode,
        city: row.objectCity,
      });
    }

    let createdObjects = 0;
    if (newObjects.length) {
      const { data: insertedObjects, error } = await supabase
        .from('cleaning_objects')
        .insert(newObjects)
        .select('id');
      if (error || !insertedObjects) return { status: 'error', message: 'Kunden wurden importiert, aber die Objekte konnten nicht vollständig angelegt werden.' };
      createdObjects = insertedObjects.length;
    }

    revalidatePath('/dashboard/kunden');
    return {
      status: 'success',
      message: `Import abgeschlossen: ${createdCustomers} Kunden und ${createdObjects} Objekte neu angelegt. Vorhandene Einträge wurden nicht dupliziert.`,
    };
  } catch {
    return { status: 'error', message: 'Der CSV-Import konnte nicht abgeschlossen werden.' };
  }
}
