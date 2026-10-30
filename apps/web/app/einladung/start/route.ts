import { createServerClient, type SetAllCookies } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { invitationCookieName, type InvitationState } from '@/lib/invitations';
import { supabasePublishableKey, supabaseUrl } from '@/lib/env';

/**
 * The one-time link from the invitation e-mail.
 *
 * The token is moved into an httpOnly cookie rather than left in the address
 * bar, so it does not end up in a browser history, a proxy log or a screenshot.
 *
 * A token that is not live is not simply rejected any more. Which of the four
 * ways it is not live decides what the next page says, and the most common of
 * them — an employee reopening the mail after their account already exists —
 * deserves "you can sign in", not an error.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  if (!token || !/^[A-Za-z0-9_-]{32,128}$/.test(token)) {
    return NextResponse.redirect(new URL('/einladung?state=UNBEKANNT', request.url));
  }

  const response = NextResponse.redirect(new URL('/einladung', request.url));
  const supabase = createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (values: Parameters<SetAllCookies>[0]) =>
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
    },
  });

  const { data: state } = await supabase.rpc('get_invitation_state', { p_token: token });
  if ((state as InvitationState | null) !== 'GUELTIG') {
    // No cookie for a spent token: there is nothing left to complete with it.
    return NextResponse.redirect(
      new URL(`/einladung?state=${encodeURIComponent((state as string) ?? 'UNBEKANNT')}`, request.url),
    );
  }

  response.cookies.set(invitationCookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/einladung',
    maxAge: 7 * 24 * 60 * 60,
  });
  return response;
}
