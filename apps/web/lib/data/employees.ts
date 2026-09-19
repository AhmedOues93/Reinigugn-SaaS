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

export type InvitationState = 'GUELTIG' | 'ANGENOMMEN' | 'ABGELAUFEN' | 'ZURUECKGEZOGEN' | 'UNBEKANNT';

export type MemberAccountState = {
  member_id: string;
  status: 'INVITED' | 'ACTIVE' | 'DISABLED';
  invitation_state: InvitationState;
  invitation_expires_at: string | null;
  invitation_sent_at: string | null;
  /** NONE or RESEND — decided in the database so no screen re-derives it. */
  suggested_action: 'NONE' | 'RESEND';
};

/**
 * Account state per member, keyed by member id.
 *
 * Deliberately separate from `employee_details`: an employee can be fully
 * documented and unable to log in, or active with barely any master data. The
 * office needs to see which of the two it is looking at.
 */
async function memberAccountStates(
  supabase: Awaited<ReturnType<typeof requireStaffCompany>>['supabase'],
): Promise<Map<string, MemberAccountState>> {
  const { data, error } = await supabase.rpc('list_member_account_states');
  if (error) return new Map();
  return new Map(((data ?? []) as MemberAccountState[]).map((row) => [row.member_id, row]));
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
  // The account side of each member, kept apart from their employment data:
  // this answers "can this person sign in", not "are they employed". An
  // invitation that quietly expired is otherwise indistinguishable from one
  // sent this morning, and the office finds out only when the employee says so.
  const accountStates = await memberAccountStates(supabase);
  const employees = members.map((member) => ({
    ...member,
    accountState: accountStates.get(member.id) ?? null,
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
