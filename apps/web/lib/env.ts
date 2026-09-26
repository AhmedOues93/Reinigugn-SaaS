/**
 * The environment, read once and checked.
 *
 * Every value the application needs from the outside world is named here, so
 * "which variables does staging need?" has a single answer that cannot drift
 * from the code. A missing variable fails loudly at the first read with the
 * name that is missing, rather than surfacing later as `undefined` inside a
 * Supabase client or an e-mail header.
 *
 * The `NEXT_PUBLIC_*` values are read through static property access on
 * purpose: Next.js only substitutes the literal value into the browser bundle
 * when it can see `process.env.NEXT_PUBLIC_FOO` written out. A dynamic lookup
 * such as `process.env[name]` compiles to a runtime read that is simply
 * undefined in the browser, which would break the client Supabase factory in a
 * way no server-side test would catch.
 *
 * Nothing privileged belongs in this file. The application talks to Supabase
 * only with the publishable key and relies on row-level security for every
 * access decision, so there is no service-role key to leak — and there must
 * never be one in code a browser bundle can reach.
 */

export type AppEnvironment = 'local' | 'staging' | 'production';

const publicEnv = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
  NETLIFY_URL: process.env.URL,
} as const;

function required(name: 'NEXT_PUBLIC_SUPABASE_URL' | 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Konfiguration fehlt: ${name} ist nicht gesetzt. Siehe apps/web/.env.example und docs/deployment.md.`,
    );
  }
  return value;
}

/**
 * Which deployment this is. Defaults to `local` so a developer who has not set
 * it gets development behaviour — never production behaviour — by accident.
 */
export function appEnvironment(): AppEnvironment {
  const value = publicEnv.NEXT_PUBLIC_APP_ENV;
  if (value === 'staging' || value === 'production' || value === 'local') return value;
  return 'local';
}

export const isProduction = () => appEnvironment() === 'production';

/** Public Supabase settings. Safe in the browser bundle by design. */
export const supabaseUrl = () => required('NEXT_PUBLIC_SUPABASE_URL', publicEnv.NEXT_PUBLIC_SUPABASE_URL);
export const supabasePublishableKey = () =>
  required('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

/**
 * The application's own origin, used for links that arrive by e-mail
 * (invitations, password resets) and therefore cannot be relative.
 *
 * Outside local development this must be configured: falling back to localhost
 * on a deployed environment would send customers and employees a link that
 * resolves to their own machine.
 */
function isLocalOrigin(value: string) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
}

export function siteUrl(): string {
  const configured = publicEnv.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '');
  const netlify = publicEnv.NETLIFY_URL?.replace(/\/+$/, '');

  // A deployed Netlify site must never emit localhost links. This also repairs
  // an accidentally copied local NEXT_PUBLIC_SITE_URL in the hosting settings:
  // Netlify's canonical URL wins over a local origin.
  if (netlify && (!configured || isLocalOrigin(configured))) return netlify;
  if (configured) return configured;
  if (netlify) return netlify;

  if (appEnvironment() !== 'local') {
    throw new Error(
      'Konfiguration fehlt: NEXT_PUBLIC_SITE_URL muss außerhalb der lokalen Entwicklung gesetzt sein, ' +
        'sonst zeigen Einladungs- und Passwortlinks auf localhost.',
    );
  }
  return 'http://localhost:3000';
}
