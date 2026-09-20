import { createServerClient, type SetAllCookies } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { supabasePublishableKey, supabaseUrl } from '@/lib/env';

export async function middleware(request: NextRequest) {
  /*
   * Server components cannot see their own URL, and the sign-in screen needs to
   * know whether the visitor was heading for the office, the field app or the
   * portal so it can address them. Passing the path on as a request header is
   * the supported way to do that; it is a copy hint only, and nothing about
   * access is decided from it.
   */
  request.headers.set('x-pathname', request.nextUrl.pathname);
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    supabaseUrl(),
    supabasePublishableKey(),
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );
  await supabase.auth.getUser();
  return response;
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
