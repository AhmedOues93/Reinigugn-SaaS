import { requireStaffCompany } from '@/lib/auth';

export type PortalContact = {
  id: string;
  memberId: string;
  status: 'ACTIVE' | 'INVITED' | 'DISABLED';
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  joinedAt: string | null;
};

/**
 * Portal contacts of one customer, for the staff dashboard. Scoped to the
 * acting staff member's company; the customer id is validated against it.
 */
export async function listPortalContacts(customerId: string): Promise<PortalContact[]> {
  const { supabase, company } = await requireStaffCompany();
  const { data, error } = await supabase
    .from('customer_contacts')
    .select('id, member_id, company_members(id, status, invited_email, invited_first_name, invited_last_name, joined_at)')
    .eq('company_id', company.id)
    .eq('customer_id', customerId);
  if (error) throw new Error('Portalzugänge konnten nicht geladen werden.');

  return (data ?? []).map((row) => {
    const member = (Array.isArray(row.company_members) ? row.company_members[0] : row.company_members) as {
      status: PortalContact['status'];
      invited_email: string | null;
      invited_first_name: string | null;
      invited_last_name: string | null;
      joined_at: string | null;
    } | null;
    return {
      id: row.id,
      memberId: row.member_id,
      status: member?.status ?? 'INVITED',
      email: member?.invited_email ?? null,
      firstName: member?.invited_first_name ?? null,
      lastName: member?.invited_last_name ?? null,
      joinedAt: member?.joined_at ?? null,
    };
  });
}

/**
 * Pending portal invitations for a customer: memberships created by the
 * invitation flow that have not been accepted yet, so no contact row exists.
 */
export async function listPendingPortalInvitations(customerId: string) {
  const { supabase, company } = await requireStaffCompany();
  const { data, error } = await supabase
    .from('company_invitations')
    .select('id, email, expires_at, accepted_at, revoked_at, member_id')
    .eq('company_id', company.id)
    .eq('customer_id', customerId)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error('Einladungen konnten nicht geladen werden.');
  return data ?? [];
}
