'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { companyNameSchema, loginSchema, passwordSchema, signUpSchema } from '@reinigung/validation';
import { appUrl } from '@/lib/utils';
import { createClient } from '@/lib/supabase/server';

function withMessage(path: string, key: 'error' | 'message', message: string): never {
  redirect(`${path}?${key}=${encodeURIComponent(message)}`);
}

export async function signUp(formData: FormData) {
  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) withMessage('/signup', 'error', parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo: appUrl('/auth/callback') },
  });
  if (error) withMessage('/signup', 'error', error.message);
  redirect('/login?message=Bitte bestätigen Sie zuerst Ihre E-Mail-Adresse.');
}

export async function login(formData: FormData) {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) withMessage('/login', 'error', parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) withMessage('/login', 'error', 'E-Mail-Adresse oder Passwort ist nicht korrekt.');
  redirect('/dashboard');
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function requestPasswordReset(formData: FormData) {
  const email = formData.get('email');
  const parsed = loginSchema.pick({ email: true }).safeParse({ email });
  if (!parsed.success) withMessage('/forgot-password', 'error', parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, { redirectTo: appUrl('/auth/callback?next=/reset-password') });
  withMessage('/forgot-password', 'message', 'Falls ein Konto existiert, wurde eine E-Mail zum Zurücksetzen versendet.');
}

export async function updatePassword(formData: FormData) {
  const parsed = passwordSchema.safeParse(formData.get('password'));
  if (!parsed.success) withMessage('/reset-password', 'error', parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) withMessage('/reset-password', 'error', 'Das Passwort konnte nicht aktualisiert werden.');
  redirect('/dashboard');
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
