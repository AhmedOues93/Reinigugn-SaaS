import { getCurrentCompany, requireStaffCompany } from '@/lib/auth';
import { addDays, berlinDateKey } from '@/lib/date';

export type JobStatusFilter = 'all' | 'PLANNED' | 'CONFIRMED' | 'CANCELLED';

export async function listActiveEmployeeOptions() {
  const { supabase, company } = await requireStaffCompany();
  const { data, error } = await supabase
    .from('company_members')
    .select('id, profiles!company_members_profile_id_fkey(first_name, last_name)')
    .eq('company_id', company.id).eq('role', 'EMPLOYEE').eq('status', 'ACTIVE').order('created_at');
  if (error) throw new Error('Mitarbeiter konnten nicht geladen werden.');
  return data ?? [];
}

export async function listJobs({ from, to, customerId, objectId, memberId, status = 'all' }: { from?: string; to?: string; customerId?: string; objectId?: string; memberId?: string; status?: JobStatusFilter }) {
  const { supabase, company } = await requireStaffCompany();
  let query = supabase
    .from('jobs')
    .select('id, title, scheduled_date, planned_start_at, planned_end_at, status, priority, service_schedule_id, customer_id, cleaning_object_id, customers(name), cleaning_objects(name, city), job_assignments(member_id, company_members(profiles!company_members_profile_id_fkey(first_name, last_name)))')
    .eq('company_id', company.id).order('planned_start_at');
  if (from) query = query.gte('scheduled_date', from);
  if (to) query = query.lte('scheduled_date', to);
  if (customerId) query = query.eq('customer_id', customerId);
  if (objectId) query = query.eq('cleaning_object_id', objectId);
  if (status !== 'all') query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw new Error('Auftraege konnten nicht geladen werden.');
  const jobs = data ?? [];
  return memberId ? jobs.filter((job) => job.job_assignments.some((assignment) => assignment.member_id === memberId)) : jobs;
}

export async function getJob(id: string) {
  const { supabase, company } = await requireStaffCompany();
  const { data, error } = await supabase
    .from('jobs')
    .select('id, customer_id, cleaning_object_id, checklist_template_id, service_schedule_id, title, description, scheduled_date, planned_start_at, planned_end_at, status, priority, internal_notes, employee_instructions, customers(id, name), cleaning_objects(id, name, street, postal_code, city), job_assignments(member_id, company_members(profiles!company_members_profile_id_fkey(first_name, last_name)))')
    .eq('company_id', company.id).eq('id', id).maybeSingle();
  if (error) throw new Error('Auftrag konnte nicht geladen werden.');
  return data;
}

export async function listServiceSchedules() {
  const { supabase, company } = await requireStaffCompany();
  const { data, error } = await supabase
    .from('service_schedules')
    .select('id, name, customer_id, cleaning_object_id, valid_from, valid_until, is_active, customers(name), cleaning_objects(name), schedule_rules(weekday, planned_start_time, planned_end_time, is_active), service_schedule_assignments(member_id)')
    .eq('company_id', company.id).order('name');
  if (error) throw new Error('Plaene konnten nicht geladen werden.');
  return data ?? [];
}

export async function getServiceSchedule(id: string) {
  const { supabase, company } = await requireStaffCompany();
  const { data, error } = await supabase
    .from('service_schedules')
    .select('id, customer_id, cleaning_object_id, checklist_template_id, name, description, valid_from, valid_until, timezone, is_active, customers(id, name), cleaning_objects(id, name), schedule_rules(id, weekday, planned_start_time, planned_end_time, is_active), service_schedule_assignments(member_id, company_members(profiles!company_members_profile_id_fkey(first_name, last_name)))')
    .eq('company_id', company.id).eq('id', id).maybeSingle();
  if (error) throw new Error('Plan konnte nicht geladen werden.');
  return data;
}

export async function getDashboardMetrics() {
  const { supabase, company } = await requireStaffCompany();
  const today = berlinDateKey();
  const weekEnd = addDays(today, 6);
  const [{ count: todayJobs }, { count: plannedToday }, { data: assignments }, { count: weekJobs }, { count: activeWorkers }, { data: completedEntries }] = await Promise.all([
    supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('company_id', company.id).eq('scheduled_date', today).neq('status', 'CANCELLED'),
    supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('company_id', company.id).eq('scheduled_date', today).in('status', ['PLANNED', 'CONFIRMED']),
    supabase.from('job_assignments').select('member_id, jobs!inner(company_id, scheduled_date, status)').eq('jobs.company_id', company.id).eq('jobs.scheduled_date', today).neq('jobs.status', 'CANCELLED'),
    supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('company_id', company.id).gte('scheduled_date', today).lte('scheduled_date', weekEnd).neq('status', 'CANCELLED'),
    supabase.from('job_time_entries').select('*', { count: 'exact', head: true }).eq('company_id', company.id).is('finished_at', null),
    supabase.from('job_time_entries').select('duration_minutes').eq('company_id', company.id).gte('started_at', `${today}T00:00:00Z`).lte('started_at', `${today}T23:59:59Z`).not('duration_minutes', 'is', null),
  ]);
  return { todayJobs: todayJobs ?? 0, plannedToday: plannedToday ?? 0, employeesScheduled: new Set((assignments ?? []).map((assignment) => assignment.member_id)).size, weekJobs: weekJobs ?? 0, activeWorkers: activeWorkers ?? 0, workedMinutes: (completedEntries ?? []).reduce((total, entry) => total + (entry.duration_minutes ?? 0), 0) };
}

export async function listMyAssignedJobs({ from, to }: { from: string; to: string }) {
  const { supabase, membership } = await getCurrentCompany();
  if (!membership || membership.role !== 'EMPLOYEE') return [];
  const { data, error } = await supabase
    .from('jobs')
    .select('id, title, scheduled_date, planned_start_at, planned_end_at, status, employee_instructions, customers(name), cleaning_objects(name, street, postal_code, city), job_assignments!inner(member_id)')
    .gte('scheduled_date', from).lte('scheduled_date', to).eq('job_assignments.member_id', membership.id).neq('status', 'CANCELLED').order('planned_start_at');
  if (error) throw new Error('Eigene Einsaetze konnten nicht geladen werden.');
  return data ?? [];
}

export async function getMyAssignedJob(id: string) {
  const { supabase, membership } = await getCurrentCompany();
  if (!membership || membership.role !== 'EMPLOYEE') return null;
  const { data, error } = await supabase.from('jobs')
    .select('id, title, scheduled_date, planned_start_at, planned_end_at, status, employee_instructions, customers(name), cleaning_objects(name, street, postal_code, city), job_time_entries(id, started_at, finished_at, duration_minutes), job_checklists(id, job_checklist_items(id, position, title, instruction, is_required, completed_at, completed_by))')
    .eq('id', id).maybeSingle();
  if (error) { console.error('getMyAssignedJob', error); throw new Error('Eigener Einsatz konnte nicht geladen werden.'); }
  return data;
}
