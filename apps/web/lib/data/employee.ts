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
  'id, title, scheduled_date, planned_start_at, planned_end_at, status, employee_instructions, customers(name), cleaning_objects(name, street, postal_code, city), job_time_entries(id, started_at, finished_at, duration_minutes, job_time_breaks(ended_at)), job_checklists(id, job_checklist_items(id, completed_at, is_required))';

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
  const [{ data }, branding] = await Promise.all([
    supabase
      .from('employee_details')
      .select('employee_number, weekly_hours, employment_start_date, employment_type, preferred_language')
      .eq('company_id', membership.company_id)
      .eq('profile_id', profile.id)
      .maybeSingle(),
    getCompanyBranding(membership.company_id),
  ]);
  return {
    profileId: profile.id,
    firstName: profile.first_name,
    lastName: profile.last_name,
    phone: profile.phone ?? null,
    email: user.email ?? null,
    avatarUrl: await signedAvatarUrl(supabase, profile.avatar_storage_path ?? null),
    role: membership.role,
    companyName: branding?.name ?? null,
    employeeNumber: data?.employee_number ?? null,
    weeklyHours: data?.weekly_hours ?? null,
    employmentStartDate: data?.employment_start_date ?? null,
    employmentType: data?.employment_type ?? null,
    preferredLanguage: isLocale(data?.preferred_language) ? data.preferred_language : 'de',
  };
}

/**
 * Avatars live in a private bucket, so a row only carries the object path. The
 * short-lived signed URL is minted per request for the caller the storage policy
 * already accepted; nothing about the path is taken from the client.
 */
export async function signedAvatarUrl(
  supabase: Awaited<ReturnType<typeof getCurrentCompany>>['supabase'],
  storagePath: string | null,
) {
  if (!storagePath) return null;
  const { data } = await supabase.storage.from('avatars').createSignedUrl(storagePath, 60 * 30);
  return data?.signedUrl ?? null;
}

// ---------------------------------------------------------------------------
// Messaging with the office
// ---------------------------------------------------------------------------

export type MessageThread = {
  id: string;
  subject: string;
  last_message_at: string;
  unread_count: number;
  employee_member_id: string;
  employee_name: string;
  last_message_preview: string | null;
};

export type ThreadMessage = {
  id: string;
  body: string;
  created_at: string;
  sender_member_id: string;
  sender_name: string;
  sender_is_staff: boolean;
  mine: boolean;
};

/**
 * Threads are read through `list_my_threads`, which resolves the actor from the
 * session. An employee only ever sees their own thread; office roles see every
 * thread of their own company. Customers have no membership row that the
 * function accepts, so the portal cannot reach this at all.
 */
export async function listMyThreads(): Promise<MessageThread[]> {
  const { supabase } = await getCurrentCompany();
  const { data, error } = await supabase.rpc('list_my_threads');
  if (error) throw new Error('Unterhaltungen konnten nicht geladen werden.');
  return (data ?? []) as MessageThread[];
}

export async function listThreadMessages(threadId: string): Promise<ThreadMessage[] | null> {
  const { supabase } = await getCurrentCompany();
  const { data, error } = await supabase.rpc('list_thread_messages', { p_thread_id: threadId });
  if (error) return null;
  return (data ?? []) as ThreadMessage[];
}

/**
 * Opening a thread clears both read marks it owns: the thread's own mark, which
 * drives the per-thread unread count, and the `MESSAGE_RECEIVED` notifications
 * that the existing badge counts. No second notification system was introduced,
 * so both have to be cleared in the same place.
 */
export async function markThreadReadForCurrentUser(threadId: string) {
  const { supabase, membership } = await getCurrentCompany();
  if (!membership) return;
  await supabase.rpc('mark_thread_read', { p_thread_id: threadId });
  await supabase
    .from('in_app_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_member_id', membership.id)
    .eq('type', 'MESSAGE_RECEIVED')
    .is('read_at', null);
}

export async function countMyUnreadMessages() {
  try {
    const threads = await listMyThreads();
    return threads.reduce((total, thread) => total + Number(thread.unread_count ?? 0), 0);
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Offline snapshot
// ---------------------------------------------------------------------------

/**
 * The exact set of rows the field app may keep on the device: the signed-in
 * employee's own assigned visits for today and the next four weeks, with the
 * operational detail needed on location. It is built from the same RLS-checked
 * queries the online screens use, so the cache can never contain a colleague's
 * work, another tenant's data, or anything commercial.
 */
export async function buildOfflineSnapshot() {
  const { supabase, membership, user } = await requireEmployee();
  const today = berlinDateKey();
  const { data, error } = await supabase
    .from('jobs')
    .select(
      'id, title, scheduled_date, planned_start_at, planned_end_at, status, employee_instructions, customers(name), cleaning_objects(name, street, postal_code, city, contact_person, contact_phone, access_instructions, cleaning_instructions), job_checklists(id, job_checklist_items(id, position, title, instruction, is_required, completed_at)), job_assignments!inner(member_id)',
    )
    .gte('scheduled_date', today)
    .lte('scheduled_date', addDays(today, 28))
    .eq('job_assignments.member_id', membership.id)
    .neq('status', 'CANCELLED')
    .order('planned_start_at');
  if (error) return null;

  const one = <T,>(value: T | T[] | null) => (Array.isArray(value) ? (value[0] ?? null) : value);
  return {
    userId: user.id,
    cachedAt: new Date().toISOString(),
    jobs: (data ?? []).map((job) => {
      const site = one(job.cleaning_objects);
      const checklist = one(job.job_checklists);
      return {
        id: job.id,
        title: job.title,
        scheduled_date: job.scheduled_date,
        planned_start_at: job.planned_start_at,
        planned_end_at: job.planned_end_at,
        status: job.status,
        employee_instructions: job.employee_instructions,
        customerName: one(job.customers)?.name ?? null,
        objectName: site?.name ?? null,
        address: [site?.street, [site?.postal_code, site?.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || null,
        contactPerson: site?.contact_person ?? null,
        contactPhone: site?.contact_phone ?? null,
        accessInstructions: site?.access_instructions ?? null,
        cleaningInstructions: site?.cleaning_instructions ?? null,
        checklist: (checklist?.job_checklist_items ?? [])
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((item) => ({
            id: item.id,
            title: item.title,
            instruction: item.instruction,
            is_required: item.is_required,
            completed_at: item.completed_at,
          })),
      };
    }),
  };
}
