'use server';

import { revalidatePath } from 'next/cache';
import { customerPortalInvitationSchema, customerSchema } from '@reinigung/validation';
import { type FormState } from '@/lib/actions';
import { requireStaffCompany } from '@/lib/auth';
import { createInvitationToken, hashInvitationToken, invitationExpiresAt } from '@/lib/invitations';
import { mailService } from '@/lib/mail/invitations';

function validationError(message: string): FormState { return { status: 'error', message }; }

export async function createCustomer(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = customerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error.issues[0]?.message ?? 'Bitte prüfe deine Eingaben.');
  try {
    const { supabase, company } = await requireStaffCompany();
    const { data, error } = await supabase.from('customers').insert({ ...parsed.data, company_id: company.id }).select('id').single();
    if (error || !data) return validationError('Der Kunde konnte nicht angelegt werden.');
    revalidatePath('/dashboard/kunden');
    return { status: 'success', id: data.id };
  } catch { return validationError('Der Kunde konnte nicht angelegt werden.'); }
}

export async function updateCustomer(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const parsed = customerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error.issues[0]?.message ?? 'Bitte prüfe deine Eingaben.');
  try {
    const { supabase, company } = await requireStaffCompany();
    const { error } = await supabase.from('customers').update(parsed.data).eq('id', id).eq('company_id', company.id);
    if (error) return validationError('Der Kunde konnte nicht aktualisiert werden.');
    revalidatePath('/dashboard/kunden'); revalidatePath(`/dashboard/kunden/${id}`);
    return { status: 'success', id };
  } catch { return validationError('Der Kunde konnte nicht aktualisiert werden.'); }
}

export async function setCustomerActive(id: string, isActive: boolean) {
  const { supabase, company } = await requireStaffCompany();
  const { error } = await supabase.from('customers').update({ is_active: isActive }).eq('id', id).eq('company_id', company.id);
  if (error) return { error: 'Der Kundenstatus konnte nicht aktualisiert werden.' };
  revalidatePath('/dashboard/kunden'); revalidatePath(`/dashboard/kunden/${id}`);
  return { error: null };
}

/**
 * Invite a portal contact for one customer. The customer id is passed to a
 * security-definer function that re-checks it against the acting staff member's
 * company, so a forged id cannot create access in another tenant.
 */
export async function inviteCustomerPortalContact(customerId: string, _: FormState, formData: FormData): Promise<FormState> {
  const parsed = customerPortalInvitationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error.issues[0]?.message ?? 'Bitte prüfe deine Eingaben.');
  try {
    const { supabase, company } = await requireStaffCompany();
    const token = createInvitationToken();
    const { data, error } = await supabase.rpc('create_customer_invitation', {
      p_customer_id: customerId,
      p_email: parsed.data.email,
      p_first_name: parsed.data.first_name,
      p_last_name: parsed.data.last_name,
      p_phone: parsed.data.phone ?? '',
      p_token_hash: hashInvitationToken(token),
      p_expires_at: invitationExpiresAt(),
    });
    const invitation = data?.[0];
    if (error || !invitation) return validationError('Der Portalzugang konnte nicht eingeladen werden.');

    const delivery = await mailService.sendInvitation({
      to: parsed.data.email,
      companyName: company.name,
      firstName: parsed.data.first_name,
      role: 'CUSTOMER',
      token,
    });
    revalidatePath(`/dashboard/kunden/${customerId}`);
    return {
      status: 'success',
      message: delivery.developmentUrl
        ? 'Einladung erstellt. In der lokalen Entwicklung steht der Link unten bereit.'
        : 'Einladung wurde erstellt.',
      invitationUrl: delivery.developmentUrl,
    };
  } catch {
    return validationError('Der Portalzugang konnte nicht eingeladen werden.');
  }
}
