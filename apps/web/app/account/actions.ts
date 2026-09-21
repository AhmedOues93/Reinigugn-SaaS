'use server';

import { type FormState } from '@/lib/actions';
import { createClient } from '@/lib/supabase/server';
import { passwordSchema } from '@reinigung/validation';

function fail(message: string): FormState {
  return { status: 'error', message };
}

export async function changeOwnPassword(_: FormState, formData: FormData): Promise<FormState> {
  const currentPassword = String(formData.get('current_password') ?? '');
  const next = passwordSchema.safeParse(formData.get('new_password'));
  const confirmation = String(formData.get('confirm_password') ?? '');

  if (!currentPassword) return fail('Bitte gib dein aktuelles Passwort ein.');
  if (!next.success) return fail(next.error.issues[0]?.message ?? 'Bitte prüfe das neue Passwort.');
  if (next.data !== confirmation) return fail('Die neuen Passwörter stimmen nicht überein.');
  if (currentPassword === next.data) return fail('Das neue Passwort muss sich vom aktuellen Passwort unterscheiden.');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return fail('Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.');

  // Re-authenticate before changing a credential. updateUser() alone only checks
  // the existing session and would otherwise let an unattended signed-in
  // browser change the account password without knowing the old one.
  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (reauthError) return fail('Das aktuelle Passwort ist nicht korrekt.');

  const { error } = await supabase.auth.updateUser({ password: next.data });
  if (error) return fail('Das Passwort konnte nicht geändert werden. Bitte versuche es erneut.');

  return { status: 'success', message: 'Passwort wurde geändert.' };
}
