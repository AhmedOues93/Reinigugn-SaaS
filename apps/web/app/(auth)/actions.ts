'use server';

import { cookies } from 'next/headers';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { companyNameSchema, loginSchema, passwordSchema, signUpSchema } from '@reinigung/validation';
import { appUrl } from '@/lib/utils';
import { SESSION_ONLY_COOKIE } from '@/lib/supabase/session-scope';
import { createClient } from '@/lib/supabase/server';

function withMessage(path: string, key: 'error' | 'message', message: string): never {
  redirect(`${path}?${key}=${encodeURIComponent(message)}`);
}

export async function signUp(formData: FormData) {
  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) withMessage('/signup', 'error', parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');

  const firstName = String(formData.get('first_name') ?? '').trim();
  const lastName = String(formData.get('last_name') ?? '').trim();
  const companyName = String(formData.get('company_name') ?? '').trim();
  if (!firstName || !lastName || !companyName) {
    withMessage('/signup', 'error', 'Vorname, Nachname und Firmenname sind erforderlich.');
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: appUrl('/auth/callback'),
      data: {
        first_name: firstName,
        last_name: lastName,
        full_name: `${firstName} ${lastName}`,
        company_name: companyName,
      },
    },
  });
  if (error) withMessage('/signup', 'error', error.message);
  redirect('/login?message=Bitte bestätigen Sie zuerst Ihre E-Mail-Adresse.');
}

export async function loginWithGoogle(formData: FormData) {
  const requestedNext = String(formData.get('next') ?? '/dashboard');
  const next = requestedNext.startsWith('/') && !requestedNext.startsWith('//') ? requestedNext : '/dashboard';
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: appUrl(`/auth/callback?next=${encodeURIComponent(next)}`),
    },
  });
  if (error || !data.url) withMessage('/admin/login', 'error', 'Google-Anmeldung konnte nicht gestartet werden.');
  redirect(data.url);
}

export async function login(formData: FormData) {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) withMessage('/login', 'error', parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');

  /*
   * "Angemeldet bleiben" decides how long the browser keeps the session, and
   * has to be recorded before the tokens are written. Unchecked is the safer
   * answer on the shared machine in the Objektleiter's office, so the marker
   * is itself a session cookie: closing the browser forgets the preference
   * along with the login it applied to.
   */
  const sessionOnly = formData.get('remember') === null;
  const jar = await cookies();
  if (sessionOnly) jar.set(SESSION_ONLY_COOKIE, '1', { httpOnly: true, sameSite: 'lax', path: '/', secure: process.env.NODE_ENV === 'production' });
  else jar.delete(SESSION_ONLY_COOKIE);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) withMessage('/login', 'error', 'E-Mail-Adresse oder Passwort ist nicht korrekt.');
  redirect('/dashboard');
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  (await cookies()).delete(SESSION_ONLY_COOKIE);
  redirect('/login');
}

export async function requestPasswordReset(formData: FormData) {
  const email = formData.get('email');
  const parsed = loginSchema.pick({ email: true }).safeParse({ email });
  if (!parsed.success) withMessage('/forgot-password', 'error', parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: appUrl('/auth/callback?next=/reset-password'),
  });

  if (error) {
    console.error('Password reset request failed:', {
      message: error.message,
      status: 'status' in error ? error.status : undefined,
      code: 'code' in error ? error.code : undefined,
    });

    const normalized = `${error.message} ${'code' in error ? error.code ?? '' : ''}`.toLowerCase();
    const rateLimited =
      ('status' in error && error.status === 429) ||
      normalized.includes('rate limit') ||
      normalized.includes('rate_limit') ||
      normalized.includes('too many');

    withMessage(
      '/forgot-password',
      'error',
      rateLimited
        ? 'Zu viele Anfragen in kurzer Zeit. Bitte warte mindestens 60 Sekunden und fordere dann genau einen neuen Link an.'
        : 'Die Passwort-E-Mail konnte technisch nicht versendet werden. Das Konto ist davon nicht betroffen. Bitte versuche es später erneut.',
    );
  }

  withMessage(
    '/forgot-password',
    'message',
    'Falls ein Konto existiert, wurde eine E-Mail zum Zurücksetzen versendet.',
  );
}

export async function updatePassword(formData: FormData) {
  const jar = await cookies();
  if (jar.get('reinplan_password_recovery')?.value !== '1') {
    withMessage('/forgot-password', 'error', 'Bitte fordere zuerst einen neuen Passwort-Link per E-Mail an.');
  }

  const parsed = passwordSchema.safeParse(formData.get('password'));
  if (!parsed.success) withMessage('/reset-password', 'error', parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
  const confirmation = String(formData.get('password_confirmation') ?? '');
  if (confirmation !== parsed.data) withMessage('/reset-password', 'error', 'Die Passwörter stimmen nicht überein.');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) withMessage('/forgot-password', 'error', 'Der Wiederherstellungslink ist ungültig oder abgelaufen.');

  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) withMessage('/reset-password', 'error', 'Das Passwort konnte nicht aktualisiert werden.');

  jar.delete('reinplan_password_recovery');
  await supabase.auth.signOut();
  redirect('/login?message=Passwort%20wurde%20geändert.%20Bitte%20melde%20dich%20mit%20dem%20neuen%20Passwort%20an.');
}

export async function createCompany(formData: FormData) {
  const parsed = companyNameSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) withMessage('/onboarding', 'error', parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');

  const supabase = await createClient();
  const { error } = await supabase.rpc('create_company_for_current_user', { company_name: parsed.data.name });
  if (error) withMessage('/onboarding', 'error', 'Die Firma konnte nicht angelegt werden.');
  revalidatePath('/dashboard');
  redirect('/dashboard');
}
