import { createServerClient, type SetAllCookies } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabasePublishableKey, supabaseUrl } from '@/lib/env';
import { SESSION_ONLY_COOKIE, scopeToSession } from '@/lib/supabase/session-scope';

export async function createClient() {
  const cookieStore = await cookies();
  // Set when somebody signed in without "Angemeldet bleiben".
  const sessionOnly = cookieStore.get(SESSION_ONLY_COOKIE)?.value === '1';
  return createServerClient(
    supabaseUrl(),
    supabasePublishableKey(),
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
          try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, scopeToSession(options, sessionOnly))); } catch {
            // Server Components cannot mutate cookies; middleware refreshes the session instead.
          }
        },
      },
    },
  );
}
