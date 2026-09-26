'use server';

import { revalidatePath } from 'next/cache';
import { type FormState } from '@/lib/actions';
import { requirePortalCustomer } from '@/lib/data/portal';

function failure(message: string): FormState {
  return { status: 'error', message };
}

function portalName(profile: { first_name?: string | null; last_name?: string | null } | null) {
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim();
  return name || 'Kundenportal';
}

export async function acceptPortalQuote(quoteId: string, _: FormState, formData: FormData): Promise<FormState> {
  const note = String(formData.get('note') ?? '').trim();
  if (note.length > 1000) return failure('Der Hinweis darf maximal 1.000 Zeichen enthalten.');

  try {
    const { supabase, profile } = await requirePortalCustomer();
    const { error } = await supabase.rpc('accept_portal_quote', {
      p_quote_id: quoteId,
      p_name: portalName(profile),
      p_note: note || null,
    });
    if (error) return failure('Das Angebot konnte nicht angenommen werden. Bitte versuche es erneut.');

    revalidatePath('/portal/angebote');
    revalidatePath(`/portal/angebote/${quoteId}`);
    revalidatePath('/dashboard/vertrieb/angebote');
    revalidatePath(`/dashboard/vertrieb/angebote/${quoteId}`);
    revalidatePath('/dashboard/kunden');
    revalidatePath('/dashboard/planung');
    return { status: 'success', message: 'Angebot wurde angenommen.' };
  } catch {
    return failure('Das Angebot konnte nicht angenommen werden.');
  }
}

export async function declinePortalQuote(quoteId: string, _: FormState, formData: FormData): Promise<FormState> {
  const reason = String(formData.get('reason') ?? '').trim();
  if (reason.length > 1000) return failure('Der Hinweis darf maximal 1.000 Zeichen enthalten.');

  try {
    const { supabase } = await requirePortalCustomer();
    const { error } = await supabase.rpc('decline_portal_quote', {
      p_quote_id: quoteId,
      p_reason: reason || null,
    });
    if (error) return failure('Das Angebot konnte nicht abgelehnt werden. Bitte versuche es erneut.');

    revalidatePath('/portal/angebote');
    revalidatePath(`/portal/angebote/${quoteId}`);
    revalidatePath('/dashboard/vertrieb/angebote');
    revalidatePath(`/dashboard/vertrieb/angebote/${quoteId}`);
    return { status: 'success', message: 'Angebot wurde abgelehnt.' };
  } catch {
    return failure('Das Angebot konnte nicht abgelehnt werden.');
  }
}
