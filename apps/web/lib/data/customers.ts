import { requireStaffCompany } from '@/lib/auth';

export type StatusFilter = 'all' | 'active' | 'inactive';

function safeSearch(value?: string) {
  return value?.trim().slice(0, 100).replace(/[%,().]/g, '') ?? '';
}

export async function listCustomers({ search, status = 'active' }: { search?: string; status?: StatusFilter }) {
  const { supabase, company } = await requireStaffCompany();
  let query = supabase
    .from('customers')
    .select('id, name, customer_number, contact_person, contact_first_name, contact_last_name, phone, city, is_active, cleaning_objects(count)')
    .eq('company_id', company.id)
    .order('name');

  if (status !== 'all') query = query.eq('is_active', status === 'active');
  const term = safeSearch(search);
  if (term) query = query.or(`name.ilike.%${term}%,contact_person.ilike.%${term}%,city.ilike.%${term}%,customer_number.ilike.%${term}%`);
  const { data, error } = await query;
  if (error) throw new Error('Kunden konnten nicht geladen werden.');
  return data ?? [];
}

export async function getCustomer(id: string) {
  const { supabase, company } = await requireStaffCompany();
  const { data, error } = await supabase
    .from('customers')
    .select('id, company_id, name, customer_number, contact_person, contact_first_name, contact_last_name, email, phone, billing_address, city, postal_code, billing_country, billing_email, billing_recipient_name, billing_recipient_address, payment_terms_days, vat_id, datev_debtor_account, notes, is_active, created_at, updated_at')
    .eq('company_id', company.id)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error('Kunde konnte nicht geladen werden.');
  return data;
}

export async function listCustomerObjects(customerId: string) {
  const { supabase, company } = await requireStaffCompany();
  const { data, error } = await supabase
    .from('cleaning_objects')
    .select('id, name, street, postal_code, city, is_active')
    .eq('company_id', company.id)
    .eq('customer_id', customerId)
    .order('name');
  if (error) throw new Error('Objekte konnten nicht geladen werden.');
  return data ?? [];
}

export async function listCustomerOptions() {
  const { supabase, company } = await requireStaffCompany();
  const { data, error } = await supabase
    .from('customers')
    .select('id, name, customer_number, contact_person, email, phone, billing_address, postal_code, city, is_active')
    .eq('company_id', company.id)
    .order('name');
  if (error) throw new Error('Kunden konnten nicht geladen werden.');
  return data ?? [];
}
