import { createServerClient, type SetAllCookies } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { invitationCookieName } from '@/lib/invitations';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  if (!token || !/^[A-Za-z0-9_-]{32,128}$/.test(token)) return NextResponse.redirect(new URL('/einladung?error=ungültig', request.url));
  const response = NextResponse.redirect(new URL('/einladung', request.url));
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (values: Parameters<SetAllCookies>[0]) => values.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
    },
  });
  const { data } = await supabase.rpc('get_invitation_preview', { p_token: token }).maybeSingle();
  if (!data) return NextResponse.redirect(new URL('/einladung?error=ungültig', request.url));
  response.cookies.set(invitationCookieName, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/einladung', maxAge: 7 * 24 * 60 * 60 });
  return response;
}
