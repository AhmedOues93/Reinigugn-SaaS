/**
 * "Angemeldet bleiben", made real.
 *
 * Unchecked, the sign-in cookies are written without an expiry, which makes
 * them session cookies: the browser drops them when it closes. Checked, they
 * keep the lifetime Supabase asked for and the person stays signed in.
 *
 * This matters on a shared office machine, which in this trade is the normal
 * case rather than the exception. The choice is remembered in its own session
 * cookie so that the middleware, which refreshes the tokens on every request,
 * applies the same rule and cannot quietly hand back a persistent cookie an
 * hour later.
 *
 * Nothing about authentication changes: the same tokens are issued and checked
 * by Supabase either way. Only how long the browser keeps them differs.
 */
export const SESSION_ONLY_COOKIE = 'sw-session-only';

type CookieOptions = { maxAge?: number; expires?: Date | string | number } & Record<string, unknown>;

/** Strips the lifetime from an auth cookie, leaving everything else intact. */
export function scopeToSession<T extends CookieOptions | undefined>(options: T, sessionOnly: boolean): T {
  if (!sessionOnly || !options) return options;
  const { maxAge: _maxAge, expires: _expires, ...rest } = options;
  return rest as T;
}
