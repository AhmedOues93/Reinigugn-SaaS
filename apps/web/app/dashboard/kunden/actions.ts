'use server';

import { revalidatePath } from 'next/cache';
import { customerSchema } from '@reinigung/validation';
import { type FormState } from '@/lib/actions';
import { requireStaffCompany } from '@/lib/auth';

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
