import { requireStaffCompany } from '@/lib/auth';
import type { LeadStatus, QuoteStatus, SurveyStatus } from '@/lib/sales-calc';

export { calculateArea, leadStatusTone, quoteStatusTone } from '@/lib/sales-calc';
export type { LeadStatus, QuoteRecurrence, QuoteStatus, SurveyStatus } from '@/lib/sales-calc';

export async function listLeads(status?: LeadStatus | 'all') {
  const { supabase, company } = await requireStaffCompany();
  let query = supabase
    .from('leads')
    .select('id, status, organisation, contact_person, email, phone, city, source, created_at, converted_customer_id, lost_reason')
    .eq('company_id', company.id)
    .order('created_at', { ascending: false });
  if (status && status !== 'all') query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw new Error('Anfragen konnten nicht geladen werden.');
  return data ?? [];
}

export async function getLead(id: string) {
  const { supabase, company } = await requireStaffCompany();
  const { data, error } = await supabase
    .from('leads')
    .select(
      'id, status, organisation, contact_person, email, phone, street, postal_code, city, source, notes, created_at, converted_customer_id, lost_reason',
    )
    .eq('company_id', company.id)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error('Anfrage konnte nicht geladen werden.');
  if (!data) return null;

  const [{ data: surveys }, { data: quotes }] = await Promise.all([
    supabase
      .from('site_surveys')
      .select('id, status, site_name, scheduled_at, completed_at')
      .eq('company_id', company.id)
      .eq('lead_id', id)
      .order('scheduled_at', { ascending: false }),
    supabase
      .from('quotes')
      .select('id, quote_number, status, title, gross_total_cents, currency, created_at')
      .eq('company_id', company.id)
      .eq('lead_id', id)
      .order('created_at', { ascending: false }),
  ]);
  return { ...data, surveys: surveys ?? [], quotes: quotes ?? [] };
}

export async function listSurveys(status?: SurveyStatus | 'all') {
  const { supabase, company } = await requireStaffCompany();
  let query = supabase
    .from('site_surveys')
    .select('id, status, site_name, scheduled_at, completed_at, city, lead_id, customer_id, leads(organisation), customers(name)')
    .eq('company_id', company.id)
    .order('scheduled_at', { ascending: false });
  if (status && status !== 'all') query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw new Error('Besichtigungen konnten nicht geladen werden.');
  return data ?? [];
}

export async function getSurvey(id: string) {
  const { supabase, company } = await requireStaffCompany();
  const { data, error } = await supabase
    .from('site_surveys')
    .select(
      'id, status, site_name, scheduled_at, completed_at, street, postal_code, city, access_notes, findings, lead_id, customer_id, conducted_by, leads(organisation), customers(name), survey_areas(id, position, name, area_sqm, floor_type, services_per_week, minutes_per_service, hourly_rate_cents, notes)',
    )
    .eq('company_id', company.id)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error('Besichtigung konnte nicht geladen werden.');
  if (!data) return null;

  const { data: quotes } = await supabase
    .from('quotes')
    .select('id, quote_number, status, title, gross_total_cents, currency')
    .eq('company_id', company.id)
    .eq('site_survey_id', id);
  return { ...data, areas: [...(data.survey_areas ?? [])].sort((a, b) => a.position - b.position), quotes: quotes ?? [] };
}

export async function listQuotes(status?: QuoteStatus | 'all') {
  const { supabase, company } = await requireStaffCompany();
  let query = supabase
    .from('quotes')
    .select(
      'id, quote_number, status, title, currency, net_total_cents, gross_total_cents, recurring_net_monthly_cents, sent_at, valid_until, created_at, lead_id, customer_id, leads(organisation), customers!quotes_customer_id_fkey(name)',
    )
    .eq('company_id', company.id)
    .order('created_at', { ascending: false });
  if (status && status !== 'all') query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw new Error('Angebote konnten nicht geladen werden.');
  return data ?? [];
}

export async function getQuote(id: string) {
  const { supabase, company } = await requireStaffCompany();
  const { data, error } = await supabase
    .from('quotes')
    .select(
      `id, quote_number, status, title, intro, currency, net_total_cents, vat_total_cents, gross_total_cents,
       recurring_net_monthly_cents, sent_at, valid_until, accepted_at, accepted_by_name, acceptance_note, accepted_via, declined_at, decline_reason, created_at,
       recipient_snapshot, company_snapshot, lead_id, customer_id, site_survey_id,
       created_customer_id, created_object_id, created_schedule_id,
       leads(organisation), customers!quotes_customer_id_fkey(name),
       quote_lines(id, position, description, quantity, unit, unit_price_cents, vat_rate_basis_points, recurrence, net_amount_cents, vat_amount_cents, gross_amount_cents)`,
    )
    .eq('company_id', company.id)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error('Angebot konnte nicht geladen werden.');
  if (!data) return null;
  return { ...data, lines: [...(data.quote_lines ?? [])].sort((a, b) => a.position - b.position) };
}

export async function getSalesSummary() {
  const { supabase } = await requireStaffCompany();
  const { data, error } = await supabase.rpc('list_sales_pipeline');
  if (error) throw new Error('Vertriebsübersicht konnte nicht geladen werden.');
  return (data ?? []) as { status: LeadStatus; lead_count: number; quoted_gross_cents: number }[];
}

export async function getCompanyHourlyRate() {
  const { supabase, company } = await requireStaffCompany();
  const { data } = await supabase.from('companies').select('default_hourly_rate_cents').eq('id', company.id).maybeSingle();
  return data?.default_hourly_rate_cents ?? null;
}

export async function listSurveyorOptions() {
  const { supabase, company } = await requireStaffCompany();
  const { data } = await supabase
    .from('company_members')
    .select('id, role, profiles!company_members_profile_id_fkey(first_name, last_name)')
    .eq('company_id', company.id)
    .in('role', ['OWNER', 'OFFICE'])
    .eq('status', 'ACTIVE');
  return (data ?? []).map((member) => {
    const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
    return { id: member.id, name: [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || '—' };
  });
}
