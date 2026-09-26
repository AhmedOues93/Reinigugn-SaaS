import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient, type SetAllCookies } from '@supabase/ssr';
import { supabasePublishableKey, supabaseUrl } from '@/lib/env';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const requestedNext = url.searchParams.get('next') ?? '/dashboard';
  const next = requestedNext.startsWith('/') && !requestedNext.startsWith('//') ? requestedNext : '/dashboard';
  const response = NextResponse.redirect(new URL(next, url.origin));

  if (code) {
    const supabase = createServerClient(
      supabaseUrl(),
      supabasePublishableKey(),
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (cookiesToSet: Parameters<SetAllCookies>[0]) => cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
        },
      },
    );
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && next === '/reset-password') {
      response.cookies.set('reinplan_password_recovery', '1', {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 15 * 60,
      });
    }
  }
  return response;
}
