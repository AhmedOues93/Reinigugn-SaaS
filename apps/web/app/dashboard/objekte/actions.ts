'use server';

import { revalidatePath } from 'next/cache';
import { cleaningObjectSchema } from '@reinigung/validation';
import { type FormState } from '@/lib/actions';
import { requireStaffCompany } from '@/lib/auth';

function validationError(message: string): FormState { return { status: 'error', message }; }

function objectWriteError(error: { code?: string; message?: string } | null, fallback: string): FormState {
  if (error?.code === '23505') return validationError('Diese Objektnummer ist bereits vergeben.');
  if (error?.code === '23503') return validationError('Kunde oder Checkliste ist nicht mehr verfügbar. Bitte Auswahl aktualisieren.');
  if (error?.code === '42501') return validationError('Für diese Änderung fehlt die Berechtigung.');
  if (error?.code === 'PGRST204') return validationError('Das Objekt konnte wegen eines veralteten Datenbankstands nicht gespeichert werden.');
  return validationError(fallback);
}

async function customerExistsInCompany(
  supabase: Awaited<ReturnType<typeof requireStaffCompany>>['supabase'],
  customerId: string,
  companyId: string,
) {
  const { data, error } = await supabase.from('customers').select('id').eq('id', customerId).eq('company_id', companyId).maybeSingle();
  return !error && Boolean(data);
}

export async function createCleaningObject(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = cleaningObjectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error.issues[0]?.message ?? 'Bitte prüfe deine Eingaben.');
  try {
    const { supabase, company } = await requireStaffCompany();
    if (!await customerExistsInCompany(supabase, parsed.data.customer_id, company.id)) return validationError('Der ausgewählte Kunde ist nicht verfügbar.');
    const { data, error } = await supabase.from('cleaning_objects').insert({ ...parsed.data, company_id: company.id }).select('id').single();
    if (error || !data) return objectWriteError(error, 'Das Objekt konnte nicht angelegt werden.');
    revalidatePath('/dashboard/objekte'); revalidatePath(`/dashboard/kunden/${parsed.data.customer_id}`);
    return { status: 'success', id: data.id };
  } catch { return validationError('Das Objekt konnte nicht angelegt werden.'); }
}

export async function updateCleaningObject(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const parsed = cleaningObjectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error.issues[0]?.message ?? 'Bitte prüfe deine Eingaben.');
  try {
    const { supabase, company } = await requireStaffCompany();
    if (!await customerExistsInCompany(supabase, parsed.data.customer_id, company.id)) return validationError('Der ausgewählte Kunde ist nicht verfügbar.');
    const { data, error } = await supabase.from('cleaning_objects').update(parsed.data).eq('id', id).eq('company_id', company.id).select('id').maybeSingle();
    if (error) return objectWriteError(error, 'Das Objekt konnte nicht aktualisiert werden.');
    if (!data) return validationError('Das Objekt wurde nicht gefunden oder ist nicht mehr verfügbar.');
    revalidatePath('/dashboard/objekte'); revalidatePath(`/dashboard/objekte/${id}`); revalidatePath(`/dashboard/kunden/${parsed.data.customer_id}`);
    return { status: 'success', id };
  } catch { return validationError('Das Objekt konnte nicht aktualisiert werden.'); }
}

export async function setCleaningObjectActive(id: string, isActive: boolean) {
  const { supabase, company } = await requireStaffCompany();
  const { data, error } = await supabase.from('cleaning_objects').update({ is_active: isActive }).eq('id', id).eq('company_id', company.id).select('id').maybeSingle();
  if (error || !data) return { error: 'Der Objektstatus konnte nicht aktualisiert werden.' };
  revalidatePath('/dashboard/objekte'); revalidatePath(`/dashboard/objekte/${id}`);
  return { error: null };
}
