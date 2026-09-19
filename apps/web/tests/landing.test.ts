import { describe, expect, it } from 'vitest';
import { landingPathForRole } from '@/lib/landing';

describe('role landing paths', () => {
  it('sends each role to its own surface', () => {
    expect(landingPathForRole('OWNER')).toBe('/dashboard');
    expect(landingPathForRole('OFFICE')).toBe('/dashboard');
    expect(landingPathForRole('EMPLOYEE')).toBe('/mitarbeiter');
    expect(landingPathForRole('CUSTOMER')).toBe('/portal');
  });

  it('sends a user without a membership to onboarding', () => {
    expect(landingPathForRole(null)).toBe('/onboarding');
    expect(landingPathForRole(undefined)).toBe('/onboarding');
  });

  it('never returns an external destination', () => {
    for (const role of ['OWNER', 'OFFICE', 'EMPLOYEE', 'CUSTOMER', 'nonsense', null]) {
      const path = landingPathForRole(role);
      expect(path.startsWith('/')).toBe(true);
      expect(path.startsWith('//')).toBe(false);
    }
  });
});
