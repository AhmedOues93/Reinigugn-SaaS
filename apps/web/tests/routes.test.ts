import { describe, expect, it } from 'vitest';

describe('foundation routes', () => {
  it('defines the expected public routes', () => {
    expect(['/login', '/signup', '/forgot-password', '/reset-password', '/onboarding', '/dashboard', '/dashboard/kunden', '/dashboard/objekte']).toHaveLength(8);
  });
});
