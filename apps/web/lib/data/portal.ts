import { redirect } from 'next/navigation';
import { cache } from 'react';
import { getCurrentCompany } from '@/lib/auth';
import { getCompanyBranding } from '@/lib/data/branding';
import { isLocale, type Locale } from '@/lib/i18n';
import { cookieLocale } from '@/lib/i18n-server';

/**
 * Portal access. Only an active CUSTOMER membership may render portal screens;
 * everyone else is sent to the surface that belongs to their role.
 */
export async function requirePortalCustomer() {
  const context = await getCurrentCompany();
  if (!context.membership) redirect('/onboarding');
  if (context.membership.role !== 'CUSTOMER') {
    redirect(context.membership.role === 'EMPLOYEE' ? '/mitarbeiter' : '/dashboard');
  }
  return { ...context, membership: context.membership };
}

export type PortalOverview = {
  companyId: string;
  companyName: string;
  customerId: string;
  customerName: string;
  customerNumber: string | null;
};

/**
 * Identity and tenant for the signed-in portal user, resolved server-side by a
 * security-definer function. The browser never supplies a company or customer id.
 */
export const getPortalOverview = cache(async (): Promise<PortalOverview | null> => {
  const { supabase } = await requirePortalCustomer();
  const { data, error } = await supabase.rpc('get_my_portal_overview');
  if (error) throw new Error('Kundendaten konnten nicht geladen werden.');
  const row = (data ?? [])[0];
  if (!row) return null;
  return {
    companyId: row.company_id,
    companyName: row.company_name,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerNumber: row.customer_number,
  };
});

export async function portalBranding() {
  const overview = await getPortalOverview();
  return overview ? getCompanyBranding(overview.companyId) : null;
}

export async function portalLocale(): Promise<Locale> {
  const stored = await cookieLocale();
  if (stored) return stored;
  const { supabase } = await requirePortalCustomer();
  const overview = await getPortalOverview();
  if (!overview) return 'de';
  const { data } = await supabase.from('companies').select('default_language').eq('id', overview.companyId).maybeSingle();
  return isLocale(data?.default_language) ? data.default_language : 'de';
}

export type PortalObject = { id: string; name: string; street: string | null; postal_code: string | null; city: string | null; contact_person: string | null; is_active: boolean };
export type PortalJob = { id: string; title: string; scheduled_date: string; planned_start_at: string | null; planned_end_at: string | null; status: string; object_id: string; object_name: string };
export type PortalServiceRecord = { job_id: string; scheduled_date: string; object_id: string; object_name: string; title: string; status: string; duration_minutes: number; completed_items: number; total_items: number };
export type PortalComplaint = { id: string; title: string; description: string; status: string; priority: string; created_at: string; object_id: string; object_name: string; updates: { status: string | null; note: string; created_at: string }[] };

export async function listPortalObjects(): Promise<PortalObject[]> {
  const { supabase } = await requirePortalCustomer();
  const { data, error } = await supabase.rpc('list_my_portal_objects');
  if (error) throw new Error('Objekte konnten nicht geladen werden.');
  return data ?? [];
}

export async function listPortalUpcomingJobs(days = 42): Promise<PortalJob[]> {
  const { supabase } = await requirePortalCustomer();
  const { data, error } = await supabase.rpc('list_my_portal_upcoming_jobs', { p_days: days });
  if (error) throw new Error('Termine konnten nicht geladen werden.');
  return data ?? [];
}

export async function listPortalServiceRecords(limit = 50): Promise<PortalServiceRecord[]> {
  const { supabase } = await requirePortalCustomer();
  const { data, error } = await supabase.rpc('list_my_portal_service_records', { p_limit: limit });
  if (error) throw new Error('Leistungsnachweise konnten nicht geladen werden.');
  return data ?? [];
}

export async function getPortalServiceRecord(jobId: string) {
  const { supabase } = await requirePortalCustomer();
  const { data, error } = await supabase.rpc('get_my_portal_service_record', { p_job_id: jobId });
  if (error) throw new Error('Leistungsnachweis konnte nicht geladen werden.');
  const row = (data ?? [])[0];
  if (!row) return null;

  // Documentation photos live in a private bucket; sign them per request.
  const { data: photos } = await supabase.rpc('list_my_portal_job_photos', { p_job_id: jobId });
  const signed = await Promise.all(
    ((photos ?? []) as { id: string; storage_path: string; category: string; description: string | null }[]).map(async (photo) => {
      const { data: url } = await supabase.storage.from('job-photos').createSignedUrl(photo.storage_path, 900);
      return { id: photo.id, category: photo.category, description: photo.description, url: url?.signedUrl ?? null };
    }),
  );

  // The Kundenabnahme, if the contract for this visit asks for one.
  const { data: acceptanceRows } = await supabase.rpc('get_my_portal_acceptance', { p_job_id: jobId });
  const acceptance = ((acceptanceRows ?? []) as PortalAcceptance[])[0] ?? null;

  return {
    jobId: row.job_id,
    scheduledDate: row.scheduled_date,
    objectName: row.object_name,
    title: row.title,
    status: row.status,
    durationMinutes: row.duration_minutes as number,
    items: (row.items ?? []) as { title: string; completed: boolean }[],
    photos: signed.filter((photo) => photo.url),
    acceptance,
  };
}

export type ServiceRecordStatus = 'ERFASST' | 'ABNAHME_AUSSTEHEND' | 'ABGENOMMEN' | 'PROBLEM_GEMELDET';
export type AcceptancePolicy = 'KEINE_ABNAHME_ERFORDERLICH' | 'VOR_ORT_UNTERSCHRIFT' | 'PORTAL_ABNAHME';

export type PortalAcceptance = {
  job_id: string;
  service_date: string;
  title: string;
  service_description: string | null;
  object_name: string;
  net_minutes: number;
  status: ServiceRecordStatus;
  acceptance_policy: AcceptancePolicy;
  acceptance_method: 'KEINE' | 'VOR_ORT_UNTERSCHRIFT' | 'PORTAL_BESTAETIGUNG' | 'BUERO_FREIGABE' | null;
  accepted_at: string | null;
  accepted_by_name: string | null;
  checklist: { title: string; completed: boolean }[] | null;
  signature_storage_path: string | null;
};

export type PortalAcceptanceRow = {
  job_id: string;
  service_date: string;
  title: string;
  object_name: string;
  status: ServiceRecordStatus;
  acceptance_policy: AcceptancePolicy;
  acceptance_method: PortalAcceptance['acceptance_method'];
  accepted_at: string | null;
  accepted_by_name: string | null;
  /** The ones the customer is actually being asked to do something about. */
  needs_my_action: boolean;
};

/**
 * Everything the customer has been asked to accept, and everything they already
 * have. Both, because a list that only shows outstanding work gives no way to
 * look up what was confirmed last month.
 */
export async function listPortalAcceptances(): Promise<PortalAcceptanceRow[]> {
  const { supabase } = await requirePortalCustomer();
  const { data, error } = await supabase.rpc('list_my_portal_acceptances');
  if (error) throw new Error('Abnahmen konnten nicht geladen werden.');
  return (data ?? []) as PortalAcceptanceRow[];
}

export async function listPortalComplaints(): Promise<PortalComplaint[]> {
  const { supabase } = await requirePortalCustomer();
  const { data, error } = await supabase.rpc('list_my_portal_complaints');
  if (error) throw new Error('Reklamationen konnten nicht geladen werden.');
  return data ?? [];
}
