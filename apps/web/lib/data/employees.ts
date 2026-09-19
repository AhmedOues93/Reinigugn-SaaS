import { requireStaffCompany } from '@/lib/auth';

export type MemberFilter = 'all' | 'INVITED' | 'ACTIVE' | 'DISABLED';
export type RoleFilter = 'all' | 'OFFICE' | 'EMPLOYEE';

const employeeDetailSelect = 'profile_id, employee_number, weekly_hours, employment_start_date, employment_end_date, employment_type, preferred_language, notes, is_active';

async function employeeDetailsByProfile(
  supabase: Awaited<ReturnType<typeof requireStaffCompany>>['supabase'],
  companyId: string,
  profileIds: string[],
) {
  if (profileIds.length === 0) return new Map<string, Record<string, unknown>>();

  const { data, error } = await supabase
    .from('employee_details')
    .select(employeeDetailSelect)
    .eq('company_id', companyId)
    .in('profile_id', profileIds);

  if (error) {
    console.error('employee_details query failed', error);
    throw new Error('Mitarbeiterdaten konnten nicht geladen werden.');
  }

  return new Map((data ?? []).map((detail) => [detail.profile_id, detail]));
}

export async function listEmployees({ search, role = 'all', status = 'all' }: { search?: string; role?: RoleFilter; status?: MemberFilter }) {
  const { supabase, company } = await requireStaffCompany();
  let query = supabase
    .from('company_members')
    .select('id, profile_id, role, status, invited_email, invited_first_name, invited_last_name, invited_phone, invited_at, joined_at, disabled_at, profiles!company_members_profile_id_fkey(first_name, last_name, phone)')
    .eq('company_id', company.id)
    .in('role', ['OFFICE', 'EMPLOYEE'])
    .order('created_at', { ascending: false });
  if (role !== 'all') query = query.eq('role', role);
  if (status !== 'all') query = query.eq('status', status);

  const { data, error } = await query;
  if (error) {
    console.error('company_members query failed', error);
    throw new Error('Mitarbeiter konnten nicht geladen werden.');
  }

  const members = data ?? [];
  const profileIds = members.flatMap((member) => member.profile_id ? [member.profile_id] : []);
  const detailsByProfile = await employeeDetailsByProfile(supabase, company.id, profileIds);
  const employees = members.map((member) => ({
    ...member,
    employee_details: member.profile_id && detailsByProfile.has(member.profile_id)
      ? [detailsByProfile.get(member.profile_id)]
      : [],
  }));

  const term = search?.trim().toLocaleLowerCase('de-DE');
  if (!term) return employees;
  return employees.filter((member) => {
    const profile = member.profiles as unknown as { first_name: string | null; last_name: string | null; phone: string | null } | null;
    return [profile?.first_name, profile?.last_name, profile?.phone, member.invited_first_name, member.invited_last_name, member.invited_email, member.invited_phone]
      .filter(Boolean).join(' ').toLocaleLowerCase('de-DE').includes(term);
  });
}

export async function getEmployee(id: string) {
  const { supabase, company } = await requireStaffCompany();
  const { data, error } = await supabase
    .from('company_members')
    .select('id, company_id, profile_id, role, status, invited_email, invited_first_name, invited_last_name, invited_phone, invited_at, joined_at, disabled_at, created_at, profiles!company_members_profile_id_fkey(first_name, last_name, phone, avatar_storage_path), company_invitations(id, expires_at, accepted_at, revoked_at, created_at)')
    .eq('company_id', company.id)
    .eq('id', id)
    .in('role', ['OFFICE', 'EMPLOYEE'])
    .maybeSingle();

  if (error) {
    console.error('company_members detail query failed', error);
    throw new Error('Mitarbeiter konnte nicht geladen werden.');
  }
  if (!data || !data.profile_id) return data ? { ...data, employee_details: [] } : null;

  const detailsByProfile = await employeeDetailsByProfile(supabase, company.id, [data.profile_id]);
  const detail = detailsByProfile.get(data.profile_id);
  return { ...data, employee_details: detail ? [detail] : [] };
}
