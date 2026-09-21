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
