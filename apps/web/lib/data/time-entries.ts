import { requireStaffCompany } from '@/lib/auth';
import { addDays, berlinDateKey } from '@/lib/date';

export async function listTimeEntries({ from = berlinDateKey(), to = addDays(berlinDateKey(), 6), memberId, customerId, objectId }: { from?: string; to?: string; memberId?: string; customerId?: string; objectId?: string } = {}) {
  const { supabase, company } = await requireStaffCompany();
  let query = supabase.from('job_time_entries').select('id, job_id, member_id, started_at, finished_at, duration_minutes, jobs!inner(company_id, customer_id, cleaning_object_id, title, status, customers(name), cleaning_objects(name)), company_members!job_time_entries_member_id_fkey(profiles!company_members_profile_id_fkey(first_name, last_name))').eq('jobs.company_id', company.id).gte('started_at', `${from}T00:00:00Z`).lte('started_at', `${to}T23:59:59Z`).order('started_at', { ascending: false });
  if (memberId) query = query.eq('member_id', memberId);
  if (customerId) query = query.eq('jobs.customer_id', customerId);
  if (objectId) query = query.eq('jobs.cleaning_object_id', objectId);
  const { data, error } = await query;
  if (error) { console.error('listTimeEntries', error); throw new Error('Arbeitszeiten konnten nicht geladen werden.'); }
  return data ?? [];
}
