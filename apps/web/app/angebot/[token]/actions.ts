'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function acceptPublicQuote(token: string, formData: FormData) {
  const name = String(formData.get('name') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim();

  if (name.length < 2 || name.length > 160) {
    redirect(`/angebot/${encodeURIComponent(token)}?error=name`);
  }
  if (note.length > 1000) {
    redirect(`/angebot/${encodeURIComponent(token)}?error=note`);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('accept_public_quote', {
    p_token: token,
    p_name: name,
    p_note: note || null,
  });

  if (error) {
    redirect(`/angebot/${encodeURIComponent(token)}?error=accept`);
  }
  redirect(`/angebot/${encodeURIComponent(token)}?accepted=1`);
}
