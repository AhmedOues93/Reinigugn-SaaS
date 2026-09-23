import { getCurrentCompany, requireStaffCompany } from '@/lib/auth';
import { addDays, berlinDateKey } from '@/lib/date';

export type JobStatusFilter = 'all' | 'PLANNED' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export async function listAssignableEmployeeOptions() {
  const { supabase, company } = await requireStaffCompany();
  const { data, error } = await supabase
    .from('company_members')
    .select('id, status, invited_first_name, invited_last_name, profiles!company_members_profile_id_fkey(first_name, last_name)')
    .eq('company_id', company.id)
    .eq('role', 'EMPLOYEE')
    .in('status', ['INVITED', 'ACTIVE'])
    .order('created_at');
  if (error) throw new Error('Mitarbeiter konnten nicht geladen werden.');
  return data ?? [];
}

export async function listActiveEmployeeOptions() {
  const { supabase, company } = await requireStaffCompany();
  const { data, error } = await supabase
    .from('company_members')
    .select('id, status, invited_first_name, invited_last_name, profiles!company_members_profile_id_fkey(first_name, last_name)')
    .eq('company_id', company.id)
    .eq('role', 'EMPLOYEE')
    .eq('status', 'ACTIVE')
    .order('created_at');
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
  if (error) throw new Error('Aufträge konnten nicht geladen werden.');
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
    .select('id, name, customer_id, cleaning_object_id, valid_from, valid_until, is_active, acceptance_policy, billing_mode, customers(name), cleaning_objects(name), schedule_rules(weekday, planned_start_time, planned_end_time, is_active), service_schedule_assignments(member_id)')
    .eq('company_id', company.id).order('name');
  if (error) throw new Error('Pläne konnten nicht geladen werden.');
  return data ?? [];
}

export async function getServiceSchedule(id: string) {
  const { supabase, company } = await requireStaffCompany();
  const { data, error } = await supabase
    .from('service_schedules')
    .select('id, customer_id, cleaning_object_id, checklist_template_id, name, description, valid_from, valid_until, timezone, is_active, acceptance_policy, billing_mode, assignment_mode, billing_unit_price_cents, billing_vat_rate_basis_points, customers(id, name), cleaning_objects(id, name, checklist_template_id, checklist_templates(name, checklist_template_items(id, position, title, instruction, is_required))), checklist_templates(name, checklist_template_items(id, position, title, instruction, is_required)), schedule_rules(id, weekday, planned_start_time, planned_end_time, is_active), service_schedule_assignments(member_id, company_members(profiles!company_members_profile_id_fkey(first_name, last_name)))')
    .eq('company_id', company.id).eq('id', id).maybeSingle();
  if (error) throw new Error('Plan konnte nicht geladen werden.');
  return data;
}

export async function getDashboardMetrics() {
  const { supabase, company } = await requireStaffCompany();
  const today = berlinDateKey();
  const weekEnd = addDays(today, 6);
  const [{ count: todayJobs }, { count: plannedToday }, { data: assignments }, { count: weekJobs }, { count: activeWorkers }, { data: completedEntries }, { count: openComplaints }, { count: overdueComplaints }, { count: recentQualityIssues }, { count: vacationToday }, { count: sickToday }, { count: openVacationRequests }, { data: affectedAssignments }] = await Promise.all([
    supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('company_id', company.id).eq('scheduled_date', today).neq('status', 'CANCELLED'),
    supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('company_id', company.id).eq('scheduled_date', today).in('status', ['PLANNED', 'CONFIRMED']),
    supabase.from('job_assignments').select('member_id, jobs!inner(company_id, scheduled_date, status)').eq('jobs.company_id', company.id).eq('jobs.scheduled_date', today).neq('jobs.status', 'CANCELLED'),
    supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('company_id', company.id).gte('scheduled_date', today).lte('scheduled_date', weekEnd).neq('status', 'CANCELLED'),
    supabase.from('job_time_entries').select('*', { count: 'exact', head: true }).eq('company_id', company.id).is('finished_at', null),
    supabase.from('job_time_entries').select('duration_minutes').eq('company_id', company.id).gte('started_at', `${today}T00:00:00Z`).lte('started_at', `${today}T23:59:59Z`).not('duration_minutes', 'is', null),
    supabase.from('complaints').select('*', { count: 'exact', head: true }).eq('company_id', company.id).in('status', ['OPEN', 'IN_PROGRESS']),
    supabase.from('complaints').select('*', { count: 'exact', head: true }).eq('company_id', company.id).lt('due_date', today).in('status', ['OPEN', 'IN_PROGRESS']),
    supabase.from('quality_inspections').select('*', { count: 'exact', head: true }).eq('company_id', company.id).eq('result', 'FAIL').gte('inspected_at', addDays(today, -30)),
    supabase.from('employee_absences').select('*', { count: 'exact', head: true }).eq('company_id', company.id).eq('absence_type', 'VACATION').eq('status', 'APPROVED').lte('start_date', today).gte('end_date', today),
    supabase.from('employee_absences').select('*', { count: 'exact', head: true }).eq('company_id', company.id).eq('absence_type', 'SICKNESS').lte('start_date', today).gte('end_date', today),
    supabase.from('employee_absences').select('*', { count: 'exact', head: true }).eq('company_id', company.id).eq('absence_type', 'VACATION').eq('status', 'PENDING'),
    supabase.rpc('list_absence_affected_assignments', { p_from: today, p_to: today }),
  ]);
  return { todayJobs: todayJobs ?? 0, plannedToday: plannedToday ?? 0, employeesScheduled: new Set((assignments ?? []).map((assignment) => assignment.member_id)).size, weekJobs: weekJobs ?? 0, activeWorkers: activeWorkers ?? 0, workedMinutes: (completedEntries ?? []).reduce((total, entry) => total + (entry.duration_minutes ?? 0), 0), openComplaints: openComplaints ?? 0, overdueComplaints: overdueComplaints ?? 0, recentQualityIssues: recentQualityIssues ?? 0, vacationToday: vacationToday ?? 0, sickToday: sickToday ?? 0, openVacationRequests: openVacationRequests ?? 0, affectedAbsenceJobs: (affectedAssignments ?? []).length };
}

export type JobStatusDistribution = {
  planned: number;
  confirmed: number;
  inProgress: number;
  completed: number;
  total: number;
};

/**
 * Where this month's visits stand, as counts by lifecycle state.
 *
 * Scoped to the current month rather than all time: a donut over every job the
 * company has ever run converges on "almost everything is finished" and stops
 * telling anybody anything. CANCELLED and MISSED are left out on purpose —
 * they are not stages of the same progression, and folding them in would make
 * the ring read as though the work were still somewhere in the pipeline.
 */
export async function getJobStatusDistribution(): Promise<JobStatusDistribution> {
  const { supabase, company } = await requireStaffCompany();
  const today = berlinDateKey();
  const monthStart = `${today.slice(0, 7)}-01`;
  const monthEnd = `${today.slice(0, 7)}-31`;

  const count = async (status: string) => {
    const { count: value } = await supabase
      .from('jobs')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', company.id)
      .eq('status', status)
      .gte('scheduled_date', monthStart)
      .lte('scheduled_date', monthEnd);
    return value ?? 0;
  };

  const [planned, confirmed, inProgress, completed] = await Promise.all([
    count('PLANNED'),
    count('CONFIRMED'),
    count('IN_PROGRESS'),
    count('COMPLETED'),
  ]);
  return {
    planned,
    confirmed,
    inProgress,
    completed,
    total: planned + confirmed + inProgress + completed,
  };
}

/**
 * Today's visits for the office overview: when, where, who, and whether the
 * clock is running. One query; the page derives lanes from it.
 */
export async function listTodayBoard() {
  const { supabase, company } = await requireStaffCompany();
  const today = berlinDateKey();
  const { data, error } = await supabase
    .from('jobs')
    .select(
      'id, title, scheduled_date, planned_start_at, planned_end_at, status, customers(name), cleaning_objects(name, city), job_assignments(member_id, company_members(profiles!company_members_profile_id_fkey(first_name, last_name))), job_time_entries(started_at, finished_at)',
    )
    .eq('company_id', company.id)
    .eq('scheduled_date', today)
    .neq('status', 'CANCELLED')
    .order('planned_start_at');
  if (error) throw new Error('Heutige Einsätze konnten nicht geladen werden.');
  return data ?? [];
}

export async function listMyAssignedJobs({ from, to }: { from: string; to: string }) {
  const { supabase, membership } = await getCurrentCompany();
  if (!membership || membership.role !== 'EMPLOYEE') return [];
  const { data, error } = await supabase
    .from('jobs')
    .select('id, title, scheduled_date, planned_start_at, planned_end_at, status, employee_instructions, customers(name), cleaning_objects(name, street, postal_code, city), job_assignments!inner(member_id)')
    .gte('scheduled_date', from).lte('scheduled_date', to).eq('job_assignments.member_id', membership.id).neq('status', 'CANCELLED').order('planned_start_at');
  if (error) throw new Error('Eigene Einsätze konnten nicht geladen werden.');
  return data ?? [];
}

export async function getMyAssignedJob(id: string) {
  const { supabase, membership } = await getCurrentCompany();
  if (!membership || membership.role !== 'EMPLOYEE') return null;
  const { data, error } = await supabase.from('jobs')
    // Operational site detail the assigned cleaner needs on location. The row is
    // already readable to them under "employees can view assigned job objects";
    // `cleaning_objects.notes` stays excluded because it is an internal note.
    .select('id, title, scheduled_date, planned_start_at, planned_end_at, status, employee_instructions, customers(name), cleaning_objects(name, street, postal_code, city, contact_person, contact_phone, access_instructions, cleaning_instructions), job_time_entries(id, started_at, finished_at, duration_minutes, break_minutes, job_time_breaks(started_at, ended_at)), job_checklists(id, job_checklist_items(id, position, title, instruction, is_required, completed_at, completed_by))')
    .eq('id', id).maybeSingle();
  if (error) { console.error('getMyAssignedJob', error); throw new Error('Eigener Einsatz konnte nicht geladen werden.'); }
  return data;
}

/**
 * Recurring plans generate visits only up to a horizon, and only when someone
 * saves or reactivates the plan. Left alone, a standing contract quietly stops
 * producing work: the planning board empties and nobody is told.
 *
 * This reports, per active plan, how far its visits currently reach, so the
 * planning screen can offer to extend the ones that are running out.
 */
export async function listSchedulesRunningOut(withinDays = 28) {
  const { supabase, company } = await requireStaffCompany();
  const today = berlinDateKey();
  const [{ data: schedules, error: scheduleError }, { data: jobs, error: jobError }] = await Promise.all([
    supabase
      .from('service_schedules')
      .select('id, name, valid_until')
      .eq('company_id', company.id)
      .eq('is_active', true),
    supabase
      .from('jobs')
      .select('service_schedule_id, scheduled_date')
      .eq('company_id', company.id)
      .not('service_schedule_id', 'is', null)
      .gte('scheduled_date', today),
  ]);
  if (scheduleError || jobError) throw new Error('Die Planungsreichweite konnte nicht geladen werden.');

  const lastBySchedule = new Map<string, string>();
  for (const job of jobs ?? []) {
    const key = job.service_schedule_id as string;
    const current = lastBySchedule.get(key);
    if (!current || job.scheduled_date > current) lastBySchedule.set(key, job.scheduled_date);
  }

  const limit = addDays(today, withinDays);
  return (schedules ?? [])
    .map((schedule) => ({ ...schedule, coveredUntil: lastBySchedule.get(schedule.id) ?? null }))
    // A plan that has already ended is not running out, it is finished.
    .filter((schedule) => !schedule.valid_until || schedule.valid_until > today)
    .filter((schedule) => !schedule.coveredUntil || schedule.coveredUntil < limit)
    .sort((a, b) => (a.coveredUntil ?? '').localeCompare(b.coveredUntil ?? ''));
}
