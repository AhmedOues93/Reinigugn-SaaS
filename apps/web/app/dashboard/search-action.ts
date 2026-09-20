'use server';

import { requireStaffCompany } from '@/lib/auth';

/**
 * The top-bar search.
 *
 * Deliberately scoped rather than universal: it looks through the three things
 * an office actually types a name into — customers, objects and invoice numbers
 * — and the field says so. A box labelled "search everything" that quietly
 * covers three tables is worse than a box that names its three tables.
 *
 * It runs on the server under the caller's session, so RLS decides what comes
 * back; the company is never taken from the request. Searching is a read the
 * user could already do from the list screens, so this adds reach, not access.
 */

export type SearchHit = { id: string; label: string; detail: string | null; href: string };
export type SearchResults = { customers: SearchHit[]; objects: SearchHit[]; invoices: SearchHit[] };

const empty: SearchResults = { customers: [], objects: [], invoices: [] };

export async function searchEntities(rawTerm: string): Promise<SearchResults> {
  const term = rawTerm.trim();
  if (term.length < 2) return empty;
  // `%` and `_` are wildcards in `ilike`; a customer called "50%" must not turn
  // into a query that matches every row.
  const pattern = `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

  try {
    const { supabase, company } = await requireStaffCompany();
    const [customers, objects, invoices] = await Promise.all([
      supabase
        .from('customers')
        .select('id, name, city')
        .eq('company_id', company.id)
        .ilike('name', pattern)
        .order('name')
        .limit(5),
      supabase
        .from('cleaning_objects')
        .select('id, name, city, customers(name)')
        .eq('company_id', company.id)
        .ilike('name', pattern)
        .order('name')
        .limit(5),
      supabase
        .from('invoices')
        .select('id, invoice_number, customers(name)')
        .eq('company_id', company.id)
        .ilike('invoice_number', pattern)
        .order('created_at', { ascending: false })
        .limit(5),
    ]);

    const nameOf = (value: unknown) => {
      const row = Array.isArray(value) ? value[0] : value;
      return (row as { name?: string } | null)?.name ?? null;
    };

    return {
      customers: (customers.data ?? []).map((row) => ({
        id: row.id as string,
        label: row.name as string,
        detail: (row.city as string | null) ?? null,
        href: `/dashboard/kunden/${row.id}`,
      })),
      objects: (objects.data ?? []).map((row) => ({
        id: row.id as string,
        label: row.name as string,
        detail: nameOf(row.customers) ?? (row.city as string | null) ?? null,
        href: `/dashboard/objekte/${row.id}`,
      })),
      invoices: (invoices.data ?? []).map((row) => ({
        id: row.id as string,
        label: (row.invoice_number as string | null) ?? '',
        detail: nameOf(row.customers),
        href: `/dashboard/abrechnung/${row.id}`,
      })),
    };
  } catch {
    // A failed search must not take the shell down with it.
    return empty;
  }
}
