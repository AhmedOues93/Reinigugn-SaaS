import { redirect } from 'next/navigation';
import { getCurrentCompany } from '@/lib/auth';
import { addDays, berlinDateKey } from '@/lib/date';
import { getCompanyBranding } from '@/lib/data/branding';
import { isLocale, type Locale } from '@/lib/i18n';
import { cookieLocale } from '@/lib/i18n-server';

export type EmployeeJob = Awaited<ReturnType<typeof listMyJobs>>[number];

/**
 * Employee surfaces resolve the membership from the session only. A non-employee
 * is sent back to the staff dashboard rather than being served employee data.
 */
export async function requireEmployee() {
  const context = await getCurrentCompany();
  if (!context.membership) redirect('/onboarding');
  if (context.membership.role !== 'EMPLOYEE') redirect('/dashboard');
  return { ...context, membership: context.membership };
}

/**
 * The employee app language: an explicit cookie choice wins, otherwise the
 * preferred language stored on the employee record by the office.
 */
export async function employeeLocale(): Promise<Locale> {
  const stored = await cookieLocale();
  if (stored) return stored;
  const { supabase, membership, profile } = await requireEmployee();
  if (!profile) return 'de';
  const { data } = await supabase
    .from('employee_details')
    .select('preferred_language')
    .eq('company_id', membership.company_id)
    .eq('profile_id', profile.id)
    .maybeSingle();
  return isLocale(data?.preferred_language) ? data.preferred_language : 'de';
}

export async function employeeBranding() {
  const { membership } = await requireEmployee();
  return getCompanyBranding(membership.company_id);
}

const jobSelection =
  'id, title, scheduled_date, planned_start_at, planned_end_at, status, employee_instructions, customers(name), cleaning_objects(name, street, postal_code, city), job_time_entries(id, started_at, finished_at, duration_minutes), job_checklists(id, job_checklist_items(id, completed_at, is_required))';

/**
 * Assigned visits in a date range. The `!inner` join on the employee's own
 * membership keeps the query to their own assignments; RLS enforces the same.
 */
export async function listMyJobs({ from, to }: { from: string; to: string }) {
  const { supabase, membership } = await requireEmployee();
  const { data, error } = await supabase
    .from('jobs')
    .select(`${jobSelection}, job_assignments!inner(member_id)`)
    .gte('scheduled_date', from)
    .lte('scheduled_date', to)
    .eq('job_assignments.member_id', membership.id)
    .neq('status', 'CANCELLED')
    .order('planned_start_at');
  if (error) throw new Error('Eigene Einsätze konnten nicht geladen werden.');
  return data ?? [];
}

export async function listMyTodayAndUpcoming() {
  const today = berlinDateKey();
  const jobs = await listMyJobs({ from: today, to: addDays(today, 28) });
  return {
    today: jobs.filter((job) => job.scheduled_date === today),
    upcoming: jobs.filter((job) => job.scheduled_date > today),
    todayKey: today,
  };
}

export async function listMyNotifications(limit = 50) {
  const { supabase, membership } = await requireEmployee();
  const { data, error } = await supabase
    .from('in_app_notifications')
    .select('id, title, body, type, read_at, created_at, job_id')
    .eq('recipient_member_id', membership.id)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error('Nachrichten konnten nicht geladen werden.');
  return data ?? [];
}

export async function countMyUnreadNotifications() {
  const { supabase, membership } = await requireEmployee();
  const { count } = await supabase
    .from('in_app_notifications')
    .select('*', { count: 'exact', head: true })
    .eq('recipient_member_id', membership.id)
    .is('read_at', null);
  return count ?? 0;
}

export async function listMyAbsences() {
  const { supabase, membership } = await requireEmployee();
  const { data, error } = await supabase
    .from('employee_absences')
    .select('id, absence_type, status, start_date, end_date, note, au_storage_path, created_at')
    .eq('member_id', membership.id)
    .order('start_date', { ascending: false });
  if (error) throw new Error('Abwesenheiten konnten nicht geladen werden.');
  return data ?? [];
}

/**
 * Profile data an employee may see about themselves. Deliberately excludes any
 * other member's HR data, internal notes and every financial field.
 */
export async function getMyEmployeeProfile() {
  const { supabase, membership, profile, user } = await requireEmployee();
  if (!profile) return null;
  const { data } = await supabase
    .from('employee_details')
    .select('employee_number, weekly_hours, employment_start_date, employment_type, preferred_language')
    .eq('company_id', membership.company_id)
    .eq('profile_id', profile.id)
    .maybeSingle();
  return {
    firstName: profile.first_name,
    lastName: profile.last_name,
    email: user.email ?? null,
    employeeNumber: data?.employee_number ?? null,
    weeklyHours: data?.weekly_hours ?? null,
    employmentStartDate: data?.employment_start_date ?? null,
    employmentType: data?.employment_type ?? null,
    preferredLanguage: isLocale(data?.preferred_language) ? data.preferred_language : 'de',
  };
}
