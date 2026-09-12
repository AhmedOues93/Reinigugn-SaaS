import { createHash, randomBytes, randomUUID } from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

const url = process.env.TEST_SUPABASE_URL;
const key = process.env.TEST_SUPABASE_ANON_KEY;
const integration = url && key ? describe : describe.skip;
const password = 'Phase7-integration-password-2026';
function futureDate(days: number) { const value = new Date(); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }

async function owner(label: string) {
  const client = createClient(url!, key!); const email = `${label}-${randomUUID()}@example.test`;
  const signedUp = await client.auth.signUp({ email, password, options: { data: { first_name: label, last_name: 'Test' } } }); expect(signedUp.error).toBeNull();
  const { data, error } = await client.rpc('create_company_for_current_user', { company_name: `${label} Reinigung` }); expect(error).toBeNull();
  return { client, companyId: data!.id as string };
}
async function member(ownerClient: SupabaseClient, role: 'OFFICE' | 'EMPLOYEE', label: string) {
  const email = `${label}-${randomUUID()}@example.test`; const token = randomBytes(32).toString('base64url');
  const invited = await ownerClient.rpc('create_employee_invitation', { p_email: email, p_first_name: label, p_last_name: 'Test', p_phone: '', p_role: role, p_employee_number: '', p_weekly_hours: null, p_employment_start_date: null, p_notes: '', p_token_hash: createHash('sha256').update(token).digest('hex'), p_expires_at: new Date(Date.now() + 3_600_000).toISOString() }); expect(invited.error).toBeNull();
  const client = createClient(url!, key!); const signedUp = await client.auth.signUp({ email, password, options: { data: { first_name: label, last_name: 'Test' } } }); expect(signedUp.error).toBeNull();
  const accepted = await client.rpc('complete_company_invitation', { p_token: token }); expect(accepted.error).toBeNull();
  return { client, id: accepted.data as string };
}
async function customerAndObject(client: SupabaseClient, companyId: string) {
  const customer = await client.from('customers').insert({ company_id: companyId, name: 'Phase 7 Kunde' }).select('id').single(); expect(customer.error).toBeNull();
  const object = await client.from('cleaning_objects').insert({ company_id: companyId, customer_id: customer.data!.id, name: 'Phase 7 Objekt' }).select('id').single(); expect(object.error).toBeNull();
  return { customerId: customer.data!.id as string, objectId: object.data!.id as string };
}

integration('Phase 7 complaints and quality RLS', () => {
  it('isolates complaints and quality inspections and permits only the scoped employee update path', async () => {
    const ownerA = await owner('Phase7OwnerA'); const ownerB = await owner('Phase7OwnerB'); const office = await member(ownerA.client, 'OFFICE', 'Phase7Office'); const employee = await member(ownerA.client, 'EMPLOYEE', 'Phase7Employee');
    const { customerId, objectId } = await customerAndObject(ownerA.client, ownerA.companyId);
    const { data: jobId, error: jobError } = await ownerA.client.rpc('create_single_job', { p_customer_id: customerId, p_cleaning_object_id: objectId, p_title: 'Phase 7 Einsatz', p_description: '', p_scheduled_date: futureDate(2), p_start_time: '08:00', p_end_time: '10:00', p_status: 'PLANNED', p_priority: 'HIGH', p_internal_notes: '', p_employee_instructions: '', p_member_ids: [employee.id] }); expect(jobError).toBeNull();
    const created = await ownerA.client.from('complaints').insert({ company_id: ownerA.companyId, customer_id: customerId, cleaning_object_id: objectId, job_id: jobId!, title: 'Fenster beanstandet', description: 'Fenster wurden nicht ausreichend gereinigt.', priority: 'HIGH', assigned_member_id: employee.id, created_by: (await ownerA.client.from('company_members').select('id').eq('company_id', ownerA.companyId).eq('role', 'OWNER').single()).data!.id }).select('id, status').single(); expect(created.error).toBeNull();
    const complaintId = created.data!.id;
    expect((await office.client.from('complaints').update({ status: 'IN_PROGRESS' }).eq('id', complaintId)).error).toBeNull();
    const employeeEdit = await employee.client.from('complaints').update({ title: 'Manipuliert' }).eq('id', complaintId).select('title'); expect(employeeEdit.data).toEqual([]);
    expect((await ownerA.client.from('complaints').select('title').eq('id', complaintId).single()).data?.title).toBe('Fenster beanstandet');
    const employeeVisible = await employee.client.from('complaints').select('id').eq('id', complaintId); expect(employeeVisible.data).toHaveLength(1);
    expect((await employee.client.rpc('add_my_complaint_update', { p_complaint_id: complaintId, p_status: 'RESOLVED', p_note: 'Fenster erneut gereinigt.' })).error).toBeNull();
    const updates = await ownerA.client.from('complaint_updates').select('status, note, author_member_id').eq('complaint_id', complaintId); expect(updates.data).toEqual([{ status: 'RESOLVED', note: 'Fenster erneut gereinigt.', author_member_id: employee.id }]);
    const followUp = await ownerA.client.rpc('create_complaint_follow_up_job', { p_complaint_id: complaintId, p_scheduled_date: futureDate(3), p_start_time: '09:00', p_end_time: '10:00', p_member_ids: [employee.id] }); expect(followUp.error).toBeNull();
    const linked = await ownerA.client.from('complaints').select('follow_up_job_id').eq('id', complaintId).single(); expect(linked.data?.follow_up_job_id).toBe(followUp.data);
    expect((await ownerB.client.from('complaints').select('id').eq('id', complaintId)).data).toEqual([]);
    expect((await ownerB.client.rpc('create_complaint_follow_up_job', { p_complaint_id: complaintId, p_scheduled_date: futureDate(3), p_start_time: '09:00', p_end_time: '10:00', p_member_ids: [] })).error).not.toBeNull();
    const inspection = await office.client.from('quality_inspections').insert({ company_id: ownerA.companyId, cleaning_object_id: objectId, job_id: jobId!, inspector_member_id: office.id, inspected_at: futureDate(1), result: 'FAIL', score: 45, criteria: ['Fenster', 'Boden'], notes: 'Nacharbeit erforderlich', follow_up_required: true }).select('id').single(); expect(inspection.error).toBeNull();
    expect((await employee.client.from('quality_inspections').insert({ company_id: ownerA.companyId, cleaning_object_id: objectId, inspector_member_id: employee.id, inspected_at: futureDate(1), result: 'PASS' })).error).not.toBeNull();
    expect((await ownerB.client.from('quality_inspections').select('id').eq('id', inspection.data!.id)).data).toEqual([]);
    const image = new File([new Uint8Array([137, 80, 78, 71])], 'beleg.png', { type: 'image/png' });
    const complaintPath = `${ownerA.companyId}/complaint/${complaintId}/${randomUUID()}.png`;
    const canUploadComplaintPhoto = await employee.client.rpc('can_upload_scoped_complaint_photo_path', { p_name: complaintPath }); expect(canUploadComplaintPhoto.data).toBe(true);
    expect((await employee.client.storage.from('job-photos').upload(complaintPath, image, { contentType: 'image/png' })).error).toBeNull();
    const complaintPhoto = await employee.client.rpc('create_operational_photo_metadata', { p_scope: 'COMPLAINT', p_record_id: complaintId, p_storage_path: complaintPath, p_category: 'DOCUMENTATION', p_description: 'Belegfoto' }); expect(complaintPhoto.error).toBeNull();
    expect((await ownerA.client.from('operational_photos').select('id').eq('id', complaintPhoto.data!)).data).toHaveLength(1);
    expect((await ownerB.client.from('operational_photos').select('id').eq('id', complaintPhoto.data!)).data).toEqual([]);
    expect((await ownerB.client.storage.from('job-photos').createSignedUrl(complaintPath, 60)).error).not.toBeNull();
    const qualityPath = `${ownerA.companyId}/quality/${inspection.data!.id}/${randomUUID()}.png`;
    expect((await office.client.storage.from('job-photos').upload(qualityPath, image, { contentType: 'image/png' })).error).toBeNull();
    const qualityPhoto = await office.client.rpc('create_operational_photo_metadata', { p_scope: 'QUALITY_INSPECTION', p_record_id: inspection.data!.id, p_storage_path: qualityPath, p_category: 'AFTER', p_description: null }); expect(qualityPhoto.error).toBeNull();
    const employeeQualityPath = `${ownerA.companyId}/quality/${inspection.data!.id}/${randomUUID()}.png`;
    expect((await employee.client.storage.from('job-photos').upload(employeeQualityPath, image, { contentType: 'image/png' })).error).not.toBeNull();
    const deletePath = await employee.client.rpc('delete_operational_photo', { p_photo_id: complaintPhoto.data! }); expect(deletePath.error).toBeNull();
    expect((await employee.client.storage.from('job-photos').remove([deletePath.data!])).error).toBeNull();
    expect((await ownerA.client.from('operational_photos').select('id').eq('id', complaintPhoto.data!)).data).toEqual([]);
  });
});
