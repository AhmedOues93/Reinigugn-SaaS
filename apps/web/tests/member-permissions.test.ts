import { describe, expect, it } from 'vitest';
import { canAccessStaffArea, canInviteMember, canManageMember } from '../lib/member-permissions';

describe('member permissions', () => {
  it('allows an owner to invite OFFICE and EMPLOYEE', () => {
    expect(canInviteMember('OWNER', 'OFFICE')).toBe(true);
    expect(canInviteMember('OWNER', 'EMPLOYEE')).toBe(true);
  });

  it('allows OFFICE to invite EMPLOYEE but not OFFICE', () => {
    expect(canInviteMember('OFFICE', 'EMPLOYEE')).toBe(true);
    expect(canInviteMember('OFFICE', 'OFFICE')).toBe(false);
  });

  it('does not allow EMPLOYEE to invite anyone', () => {
    expect(canInviteMember('EMPLOYEE', 'EMPLOYEE')).toBe(false);
  });

  it('never allows anyone to manage an owner', () => {
    expect(canManageMember('OWNER', 'OWNER')).toBe(false);
    expect(canManageMember('OFFICE', 'OWNER')).toBe(false);
  });

  it('grants staff routes only to OWNER and OFFICE', () => {
    expect(canAccessStaffArea('OWNER')).toBe(true);
    expect(canAccessStaffArea('OFFICE')).toBe(true);
    expect(canAccessStaffArea('EMPLOYEE')).toBe(false);
  });
});
