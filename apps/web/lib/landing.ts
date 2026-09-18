import type { CompanyRole } from '@reinigung/types';

/**
 * The single place that maps a role to its product surface. Every redirect after
 * sign-in, onboarding or an accepted invitation goes through this, so the three
 * surfaces can never drift apart.
 */
export function landingPathForRole(role: CompanyRole | string | null | undefined) {
  switch (role) {
    case 'EMPLOYEE':
      return '/mitarbeiter';
    case 'CUSTOMER':
      return '/portal';
    case 'OWNER':
    case 'OFFICE':
      return '/dashboard';
    default:
      return '/onboarding';
  }
}
