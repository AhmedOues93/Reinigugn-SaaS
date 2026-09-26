import { requireStaffCompany } from '@/lib/auth';
import { addDays, berlinDateKey } from '@/lib/date';

/**
 * The three dashboard panels that have no table of their own.
 *
 * There is no activity log in this product, and inventing one would mean
 * writing to a new table on every action — a real change to how the
 * application behaves, made for a panel. Instead the feed is assembled at read
 * time from the `created_at` of the records that already exist. That is honest:
 * every row shown is a record somebody really created, and the list is short
 * enough that four small indexed queries cost less than one join.
 */

export type PortfolioCounts = {
  customers: number;
  customersThisMonth: number;
  objects: number;
  objectsThisMonth: number;
  employees: number;
};

/**
 * What the company currently looks after. Counts only, through RLS, so a
 * company can never see another's totals.
 *
 * "Aktiv" means what each screen means by it: customers and objects carry an
 * `is_active` flag, an employee is a member with an ACTIVE membership. The
 * month deltas are counted from `created_at` rather than stored, so they cannot
 * drift out of date.
 */
export async function getPortfolioCounts(): Promise<PortfolioCounts> {
  const { supabase, company } = await requireStaffCompany();
  const monthStart = `${berlinDateKey().slice(0, 7)}-01T00:00:00Z`;

  const [customers, customersNew, objects, objectsNew, employees] = await Promise.all([
    supabase.from('customers').select('*', { count: 'exact', head: true }).eq('company_id', company.id).eq('is_active', true),
    supabase.from('customers').select('*', { count: 'exact', head: true }).eq('company_id', company.id).gte('created_at', monthStart),
    supabase.from('cleaning_objects').select('*', { count: 'exact', head: true }).eq('company_id', company.id).eq('is_active', true),
    supabase.from('cleaning_objects').select('*', { count: 'exact', head: true }).eq('company_id', company.id).gte('created_at', monthStart),
    supabase.from('company_members').select('*', { count: 'exact', head: true }).eq('company_id', company.id).eq('status', 'ACTIVE').eq('role', 'EMPLOYEE'),
  ]);

  return {
    customers: customers.count ?? 0,
    customersThisMonth: customersNew.count ?? 0,
    objects: objects.count ?? 0,
    objectsThisMonth: objectsNew.count ?? 0,
    employees: employees.count ?? 0,
  };
}

export type ActivityKind = 'QUOTE' | 'CUSTOMER' | 'JOB' | 'INVOICE';

export type ActivityEntry = {
  kind: ActivityKind;
  title: string;
  at: string;
  href: string;
  status?: string;
};

export async function getRecentActivity(limit = 6): Promise<ActivityEntry[]> {
  const { supabase, company } = await requireStaffCompany();

  const [quotes, customers, jobs, invoices] = await Promise.all([
    supabase
      .from('quotes')
      .select('id, title, quote_number, status, created_at')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('customers')
      .select('id, name, created_at')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('jobs')
      .select('id, title, status, updated_at, cleaning_objects(name)')
      .eq('company_id', company.id)
      .eq('status', 'COMPLETED')
      .order('updated_at', { ascending: false })
      .limit(limit),
    supabase
      .from('invoices')
      .select('id, invoice_number, status, created_at')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false })
      .limit(limit),
  ]);

  const entries: ActivityEntry[] = [
    ...(quotes.data ?? []).map((row) => ({
      kind: 'QUOTE' as const,
      title: row.quote_number ? `${row.quote_number} · ${row.title}` : row.title,
      at: row.created_at as string,
      href: `/dashboard/vertrieb/angebote/${row.id}`,
      status: row.status as string,
    })),
    ...(customers.data ?? []).map((row) => ({
      kind: 'CUSTOMER' as const,
      title: row.name as string,
      at: row.created_at as string,
      href: `/dashboard/kunden/${row.id}`,
    })),
    ...(jobs.data ?? []).map((row) => {
      const object = Array.isArray(row.cleaning_objects) ? row.cleaning_objects[0] : row.cleaning_objects;
      return {
        kind: 'JOB' as const,
        title: (object as { name?: string } | null)?.name ?? (row.title as string),
        at: row.updated_at as string,
        href: `/dashboard/auftraege/${row.id}`,
        status: row.status as string,
      };
    }),
    ...(invoices.data ?? []).map((row) => ({
      kind: 'INVOICE' as const,
      title: (row.invoice_number as string | null) ?? 'Entwurf',
      at: row.created_at as string,
      href: `/dashboard/abrechnung/${row.id}`,
      status: row.status as string,
    })),
  ];

  return entries.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

export type QualitySummary = {
  /** Average of the scores actually recorded, 0–100, or null when none are. */
  averageScore: number | null;
  inspections: number;
  passed: number;
  openComplaints: number;
  /** Finished work the customer accepted, over the same window. */
  acceptedRecords: number;
  disputedRecords: number;
};

/**
 * Quality, from what the company actually measures.
 *
 * This product records inspections with a score, complaints, and whether a
 * customer accepted the work — it does not collect customer star ratings, so
 * none are shown. A satisfaction figure invented for a dashboard is worse than
 * an empty panel: somebody will quote it back to a customer.
 */
export async function getQualitySummary(days = 90): Promise<QualitySummary> {
  const { supabase, company } = await requireStaffCompany();
  const since = addDays(berlinDateKey(), -days);

  const [inspections, complaints, accepted, disputed] = await Promise.all([
    supabase
      .from('quality_inspections')
      .select('result, score')
      .eq('company_id', company.id)
      .gte('inspected_at', since),
    supabase
      .from('complaints')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', company.id)
      .in('status', ['OPEN', 'IN_PROGRESS']),
    supabase
      .from('service_records')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', company.id)
      .eq('status', 'ACCEPTED'),
    supabase
      .from('service_records')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', company.id)
      .eq('status', 'DISPUTED'),
  ]);

  const rows = inspections.data ?? [];
  const scored = rows.filter((row) => typeof row.score === 'number');
  return {
    averageScore: scored.length
      ? Math.round(scored.reduce((total, row) => total + (row.score as number), 0) / scored.length)
      : null,
    inspections: rows.length,
    passed: rows.filter((row) => row.result === 'PASS').length,
    openComplaints: complaints.count ?? 0,
    acceptedRecords: accepted.count ?? 0,
    disputedRecords: disputed.count ?? 0,
  };
}
