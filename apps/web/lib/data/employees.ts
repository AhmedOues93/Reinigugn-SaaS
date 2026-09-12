import { requireStaffCompany } from '@/lib/auth';

export type MemberFilter = 'all' | 'INVITED' | 'ACTIVE' | 'DISABLED';
export type RoleFilter = 'all' | 'OFFICE' | 'EMPLOYEE';

export async function listEmployees({ search, role = 'all', status = 'all' }: { search?: string; role?: RoleFilter; status?: MemberFilter }) {
  const { supabase, company } = await requireStaffCompany();
  let query = supabase
    .from('company_members')
    .select('id, profile_id, role, status, invited_email, invited_first_name, invited_last_name, invited_phone, invited_at, joined_at, disabled_at, profiles!company_members_profile_id_fkey(first_name, last_name, phone), employee_details(employee_number, weekly_hours, employment_start_date, notes, is_active)')
    .eq('company_id', company.id)
    .in('role', ['OFFICE', 'EMPLOYEE'])
    .order('created_at', { ascending: false });
  if (role !== 'all') query = query.eq('role', role);
  if (status !== 'all') query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw new Error('Mitarbeiter konnten nicht geladen werden.');
  const term = search?.trim().toLocaleLowerCase('de-DE');
  if (!term) return data ?? [];
  return (data ?? []).filter((member) => {
    const profile = member.profiles as unknown as { first_name: string | null; last_name: string | null; phone: string | null } | null;
    return [profile?.first_name, profile?.last_name, profile?.phone, member.invited_first_name, member.invited_last_name, member.invited_email, member.invited_phone]
      .filter(Boolean).join(' ').toLocaleLowerCase('de-DE').includes(term);
  });
}

export async function getEmployee(id: string) {
  const { supabase, company } = await requireStaffCompany();
  const { data, error } = await supabase
    .from('company_members')
    .select('id, company_id, profile_id, role, status, invited_email, invited_first_name, invited_last_name, invited_phone, invited_at, joined_at, disabled_at, created_at, profiles!company_members_profile_id_fkey(first_name, last_name, phone, avatar_url), employee_details(employee_number, weekly_hours, employment_start_date, notes, is_active), company_invitations(id, expires_at, accepted_at, revoked_at, created_at)')
    .eq('company_id', company.id)
    .eq('id', id)
    .in('role', ['OFFICE', 'EMPLOYEE'])
    .maybeSingle();
  if (error) throw new Error('Mitarbeiter konnte nicht geladen werden.');
  return data;
}
