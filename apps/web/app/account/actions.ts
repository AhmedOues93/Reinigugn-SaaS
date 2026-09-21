'use server';

import { type FormState } from '@/lib/actions';
import { createClient } from '@/lib/supabase/server';
import { appUrl } from '@/lib/utils';

function fail(message: string): FormState {
  return { status: 'error', message };
}

export async function requestOwnPasswordChange(_: FormState, _formData: FormData): Promise<FormState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return fail('Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.');

  const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
    redirectTo: appUrl('/auth/callback?next=/reset-password'),
  });
  if (error) return fail('Die Bestätigungs-E-Mail konnte nicht versendet werden. Bitte versuche es erneut.');

  return {
    status: 'success',
    message: `Wir haben einen Bestätigungslink an ${user.email} gesendet. Erst über diesen Link kann das Passwort geändert werden.`,
  };
}


export async function requestOwnEmailChange(_: FormState, formData: FormData): Promise<FormState> {
  const currentPassword = String(formData.get('current_password') ?? '');
  const nextEmail = String(formData.get('new_email') ?? '').trim().toLowerCase();

  if (!currentPassword) return fail('Bitte gib dein aktuelles Passwort ein.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(nextEmail)) return fail('Bitte gib eine gültige E-Mail-Adresse ein.');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return fail('Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.');
  if (user.email.toLowerCase() === nextEmail) return fail('Die neue E-Mail-Adresse ist identisch mit der aktuellen.');

  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (reauthError) return fail('Das aktuelle Passwort ist nicht korrekt.');

  const { error } = await supabase.auth.updateUser(
    { email: nextEmail },
    { emailRedirectTo: appUrl('/auth/callback?next=/dashboard/settings') },
  );
  if (error) return fail('Die E-Mail-Änderung konnte nicht gestartet werden. Bitte versuche es erneut.');

  return {
    status: 'success',
    message: `Bestätigungslink wurde an ${nextEmail} gesendet. Die E-Mail-Adresse wird erst nach der Bestätigung geändert.`,
  };
}
