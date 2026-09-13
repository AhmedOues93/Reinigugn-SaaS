'use server';

import { revalidatePath } from 'next/cache';
import { cleaningObjectSchema } from '@reinigung/validation';
import { type FormState } from '@/lib/actions';
import { requireStaffCompany } from '@/lib/auth';

function validationError(message: string): FormState { return { status: 'error', message }; }

async function customerExistsInCompany(customerId: string, companyId: string) {
  const { supabase } = await requireStaffCompany();
  const { data } = await supabase.from('customers').select('id').eq('id', customerId).eq('company_id', companyId).maybeSingle();
  return Boolean(data);
}

export async function createCleaningObject(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = cleaningObjectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error.issues[0]?.message ?? 'Bitte prüfe deine Eingaben.');
  try {
    const { supabase, company } = await requireStaffCompany();
    if (!await customerExistsInCompany(parsed.data.customer_id, company.id)) return validationError('Der ausgewählte Kunde ist nicht verfügbar.');
    const { data, error } = await supabase.from('cleaning_objects').insert({ ...parsed.data, company_id: company.id }).select('id').single();
    if (error || !data) return validationError('Das Objekt konnte nicht angelegt werden.');
    revalidatePath('/dashboard/objekte'); revalidatePath(`/dashboard/kunden/${parsed.data.customer_id}`);
    return { status: 'success', id: data.id };
  } catch { return validationError('Das Objekt konnte nicht angelegt werden.'); }
}

export async function updateCleaningObject(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const parsed = cleaningObjectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error.issues[0]?.message ?? 'Bitte prüfe deine Eingaben.');
  try {
    const { supabase, company } = await requireStaffCompany();
    if (!await customerExistsInCompany(parsed.data.customer_id, company.id)) return validationError('Der ausgewählte Kunde ist nicht verfügbar.');
    const { error } = await supabase.from('cleaning_objects').update(parsed.data).eq('id', id).eq('company_id', company.id);
    if (error) return validationError('Das Objekt konnte nicht aktualisiert werden.');
    revalidatePath('/dashboard/objekte'); revalidatePath(`/dashboard/objekte/${id}`); revalidatePath(`/dashboard/kunden/${parsed.data.customer_id}`);
    return { status: 'success', id };
  } catch { return validationError('Das Objekt konnte nicht aktualisiert werden.'); }
}

export async function setCleaningObjectActive(id: string, isActive: boolean) {
  const { supabase, company } = await requireStaffCompany();
  const { error } = await supabase.from('cleaning_objects').update({ is_active: isActive }).eq('id', id).eq('company_id', company.id);
  if (error) return { error: 'Der Objektstatus konnte nicht aktualisiert werden.' };
  revalidatePath('/dashboard/objekte'); revalidatePath(`/dashboard/objekte/${id}`);
  return { error: null };
}
