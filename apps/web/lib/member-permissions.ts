export type StaffRole = 'OWNER' | 'OFFICE' | 'EMPLOYEE';
export type InviteRole = 'OFFICE' | 'EMPLOYEE';

export function canInviteMember(actorRole: StaffRole, invitedRole: InviteRole) {
  return actorRole === 'OWNER' || (actorRole === 'OFFICE' && invitedRole === 'EMPLOYEE');
}

export function canManageMember(actorRole: StaffRole, targetRole: StaffRole) {
  if (targetRole === 'OWNER') return false;
  return actorRole === 'OWNER' || (actorRole === 'OFFICE' && targetRole === 'EMPLOYEE');
}

export function canAccessStaffArea(role: StaffRole) {
  return role === 'OWNER' || role === 'OFFICE';
}
