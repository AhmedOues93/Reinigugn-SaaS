import { requireStaffCompany } from '@/lib/auth';
import { getCurrentCompany } from '@/lib/auth';

const complaintSelection = 'id, customer_id, cleaning_object_id, job_id, title, description, priority, status, assigned_member_id, due_date, internal_note, follow_up_job_id, created_at, updated_at, customers(id, name), cleaning_objects(id, name), jobs!complaints_job_id_fkey(id, title), company_members!complaints_assigned_member_id_fkey(id, profiles!company_members_profile_id_fkey(first_name, last_name))';

export async function listComplaints({ objectId, customerId }: { objectId?: string; customerId?: string } = {}) {
  const { supabase, company } = await requireStaffCompany();
  let query = supabase.from('complaints').select(complaintSelection).eq('company_id', company.id).order('due_date', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false });
  if (objectId) query = query.eq('cleaning_object_id', objectId);
  if (customerId) query = query.eq('customer_id', customerId);
  const { data, error } = await query;
  if (error) throw new Error('Reklamationen konnten nicht geladen werden.');
  return data ?? [];
}

export async function getComplaint(id: string) {
  const { supabase, company } = await requireStaffCompany();
  const [{ data: complaint, error }, { data: employees, error: employeesError }] = await Promise.all([
    supabase.from('complaints').select(complaintSelection).eq('company_id', company.id).eq('id', id).maybeSingle(),
    supabase.from('company_members').select('id, profiles!company_members_profile_id_fkey(first_name, last_name)').eq('company_id', company.id).eq('role', 'EMPLOYEE').eq('status', 'ACTIVE').order('created_at'),
  ]);
  if (error || employeesError) throw new Error('Reklamation konnte nicht geladen werden.');
  if (!complaint) return null;
  const { data: updates, error: updatesError } = await supabase
    .from('complaint_updates')
    .select('id, status, note, created_at, company_members!complaint_updates_author_member_id_fkey(profiles!company_members_profile_id_fkey(first_name, last_name))')
    .eq('complaint_id', id).order('created_at', { ascending: false });
  if (updatesError) throw new Error('Reklamationsverlauf konnte nicht geladen werden.');
  return { complaint, updates: updates ?? [], employees: employees ?? [] };
}

export async function listComplaintFormOptions() {
  const { supabase, company } = await requireStaffCompany();
  const [{ data: customers, error: customerError }, { data: objects, error: objectError }, { data: jobs, error: jobError }, { data: employees, error: employeeError }] = await Promise.all([
    supabase.from('customers').select('id, name').eq('company_id', company.id).eq('is_active', true).order('name'),
    supabase.from('cleaning_objects').select('id, customer_id, name').eq('company_id', company.id).eq('is_active', true).order('name'),
    supabase.from('jobs').select('id, customer_id, cleaning_object_id, title, scheduled_date').eq('company_id', company.id).order('scheduled_date', { ascending: false }).limit(100),
    supabase.from('company_members').select('id, profiles!company_members_profile_id_fkey(first_name, last_name)').eq('company_id', company.id).eq('role', 'EMPLOYEE').eq('status', 'ACTIVE').order('created_at'),
  ]);
  if (customerError || objectError || jobError || employeeError) throw new Error('Formularoptionen konnten nicht geladen werden.');
  return { customers: customers ?? [], objects: objects ?? [], jobs: jobs ?? [], employees: employees ?? [] };
}

export async function listQualityInspections({ objectId }: { objectId?: string } = {}) {
  const { supabase, company } = await requireStaffCompany();
  let query = supabase.from('quality_inspections').select('id, cleaning_object_id, job_id, inspected_at, result, score, criteria, notes, follow_up_required, created_at, cleaning_objects(id, name), jobs(id, title), company_members!quality_inspections_inspector_member_id_fkey(profiles!company_members_profile_id_fkey(first_name, last_name))').eq('company_id', company.id).order('inspected_at', { ascending: false });
  if (objectId) query = query.eq('cleaning_object_id', objectId);
  const { data, error } = await query;
  if (error) throw new Error('Qualitätskontrollen konnten nicht geladen werden.');
  return data ?? [];
}

export async function listMyOperationalComplaints() {
  const { supabase, membership } = await getCurrentCompany();
  if (!membership || membership.role !== 'EMPLOYEE') return [];
  const { data, error } = await supabase.from('complaints').select('id, title, description, status, due_date, cleaning_objects(name), jobs!complaints_job_id_fkey(title)').order('due_date', { ascending: true, nullsFirst: false });
  if (error) throw new Error('Eigene Reklamationen konnten nicht geladen werden.');
  return data ?? [];
}


export async function getQualityInspection(id: string) {
  const { supabase, company } = await requireStaffCompany();
  const { data, error } = await supabase
    .from('quality_inspections')
    .select('id, cleaning_object_id, job_id, inspected_at, result, score, criteria, notes, follow_up_required, created_at, cleaning_objects(id, name, customer_id), jobs(id, title, scheduled_date), company_members!quality_inspections_inspector_member_id_fkey(profiles!company_members_profile_id_fkey(first_name, last_name))')
    .eq('company_id', company.id)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error('Qualitätskontrolle konnte nicht geladen werden.');
  return data;
}
