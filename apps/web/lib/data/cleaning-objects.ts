import { requireStaffCompany } from '@/lib/auth';
import type { StatusFilter } from './customers';

function safeSearch(value?: string) {
  return value?.trim().slice(0, 100).replace(/[%,().]/g, '') ?? '';
}

export async function listCleaningObjects({ search, status = 'active', customerId }: { search?: string; status?: StatusFilter; customerId?: string }) {
  const { supabase, company } = await requireStaffCompany();
  let query = supabase
    .from('cleaning_objects')
    .select('id, name, city, is_active, customer_id, customers(name)')
    .eq('company_id', company.id)
    .order('name');

  if (status !== 'all') query = query.eq('is_active', status === 'active');
  if (customerId) query = query.eq('customer_id', customerId);
  const term = safeSearch(search);
  if (term) query = query.or(`name.ilike.%${term}%,city.ilike.%${term}%`);
  const { data, error } = await query;
  if (error) throw new Error('Objekte konnten nicht geladen werden.');
  return data ?? [];
}

export async function getCleaningObject(id: string) {
  const { supabase, company } = await requireStaffCompany();
  const { data, error } = await supabase
    .from('cleaning_objects')
    .select('id, company_id, customer_id, name, street, postal_code, city, contact_person, contact_phone, access_instructions, cleaning_instructions, notes, is_active, created_at, updated_at, customers(id, name)')
    .eq('company_id', company.id)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error('Objekt konnte nicht geladen werden.');
  return data;
}

export async function listCleaningObjectOptions() {
  const { supabase, company } = await requireStaffCompany();
  const { data, error } = await supabase.from('cleaning_objects').select('id, customer_id, name, city, is_active').eq('company_id', company.id).order('name');
  if (error) throw new Error('Objekte konnten nicht geladen werden.');
  return data ?? [];
}
