import { createHash, randomBytes, randomUUID } from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

const url = process.env.TEST_SUPABASE_URL;
const key = process.env.TEST_SUPABASE_ANON_KEY;
const integration = url && key ? describe : describe.skip;
const password = 'Phase8-integration-password-2026';
function futureDate(days: number) { const value = new Date(); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }

async function owner(label: string) {
  const client = createClient(url!, key!); const email = `${label}-${randomUUID()}@example.test`;
  expect((await client.auth.signUp({ email, password, options: { data: { first_name: label, last_name: 'Test' } } })).error).toBeNull();
  const { data, error } = await client.rpc('create_company_for_current_user', { company_name: `${label} Reinigung` }); expect(error).toBeNull();
  return { client, companyId: data!.id as string };
}
async function member(ownerClient: SupabaseClient, role: 'OFFICE' | 'EMPLOYEE', label: string) {
  const email = `${label}-${randomUUID()}@example.test`; const token = randomBytes(32).toString('base64url');
  expect((await ownerClient.rpc('create_employee_invitation', { p_email: email, p_first_name: label, p_last_name: 'Test', p_phone: '', p_role: role, p_employee_number: '', p_weekly_hours: null, p_employment_start_date: null, p_notes: '', p_token_hash: createHash('sha256').update(token).digest('hex'), p_expires_at: new Date(Date.now() + 3_600_000).toISOString() })).error).toBeNull();
  const client = createClient(url!, key!); expect((await client.auth.signUp({ email, password, options: { data: { first_name: label, last_name: 'Test' } } })).error).toBeNull();
  const accepted = await client.rpc('complete_company_invitation', { p_token: token }); expect(accepted.error).toBeNull();
  return { client, id: accepted.data as string };
}
async function jobSetup(client: SupabaseClient, companyId: string, employees: string[], day: string, title = 'Phase 8 Einsatz') {
  const customer = await client.from('customers').insert({ company_id: companyId, name: 'Phase 8 Kunde' }).select('id').single(); expect(customer.error).toBeNull();
  const object = await client.from('cleaning_objects').insert({ company_id: companyId, customer_id: customer.data!.id, name: 'Phase 8 Objekt' }).select('id').single(); expect(object.error).toBeNull();
  const created = await client.rpc('create_single_job', { p_customer_id: customer.data!.id, p_cleaning_object_id: object.data!.id, p_title: title, p_description: '', p_scheduled_date: day, p_start_time: '08:00', p_end_time: '10:00', p_status: 'PLANNED', p_priority: 'MEDIUM', p_internal_notes: '', p_employee_instructions: '', p_member_ids: employees }); expect(created.error).toBeNull();
  return created.data as string;
}

integration('Phase 8 absences, replacements, notifications, and RLS', () => {
  it('enforces vacation review, sickness privacy, planning conflicts, replacement eligibility, and tenant isolation', async () => {
    const ownerA = await owner('Phase8OwnerA'); const ownerB = await owner('Phase8OwnerB');
    const office = await member(ownerA.client, 'OFFICE', 'Phase8Office'); const absentEmployee = await member(ownerA.client, 'EMPLOYEE', 'Phase8Absent'); const replacement = await member(ownerA.client, 'EMPLOYEE', 'Phase8Replacement'); const busyEmployee = await member(ownerA.client, 'EMPLOYEE', 'Phase8Busy');
    const day = futureDate(5); const jobId = await jobSetup(ownerA.client, ownerA.companyId, [absentEmployee.id], day);

    const vacation = await absentEmployee.client.rpc('create_my_absence', { p_type: 'VACATION', p_start: day, p_end: day, p_note: 'Familientermin' }); expect(vacation.error).toBeNull();
    expect((await absentEmployee.client.from('employee_absences').select('id,status').eq('id', vacation.data!).single()).data?.status).toBe('PENDING');
    expect((await absentEmployee.client.rpc('review_absence', { p_absence_id: vacation.data!, p_approved: true })).error).not.toBeNull();
    expect((await ownerB.client.from('employee_absences').select('id').eq('id', vacation.data!)).data).toEqual([]);
    expect((await office.client.rpc('review_absence', { p_absence_id: vacation.data!, p_approved: true })).error).toBeNull();
    expect((await absentEmployee.client.from('in_app_notifications').select('type').eq('absence_id', vacation.data!)).data?.some((item) => item.type === 'VACATION_APPROVED')).toBe(true);

    const sickness = await absentEmployee.client.rpc('create_my_absence', { p_type: 'SICKNESS', p_start: day, p_end: day, p_note: 'Arbeitsunfähig' }); expect(sickness.error).toBeNull();
    expect((await absentEmployee.client.from('employee_absences').select('status').eq('id', sickness.data!).single()).data?.status).toBe('APPROVED');
    expect((await replacement.client.from('employee_absences').select('id').eq('id', sickness.data!)).data).toEqual([]);
    const image = new File([new Uint8Array([137, 80, 78, 71])], 'au.png', { type: 'image/png' }); const documentPath = `${ownerA.companyId}/absence/${sickness.data}/${randomUUID()}.png`;
    expect((await absentEmployee.client.storage.from('absence-documents').upload(documentPath, image, { contentType: 'image/png' })).error).toBeNull();
    expect((await absentEmployee.client.rpc('attach_my_au_document', { p_absence_id: sickness.data!, p_path: documentPath })).error).toBeNull();
    expect((await ownerA.client.storage.from('absence-documents').createSignedUrl(documentPath, 60)).data?.signedUrl).toBeTruthy();
    expect((await ownerB.client.storage.from('absence-documents').createSignedUrl(documentPath, 60)).error).not.toBeNull();

    await jobSetup(ownerA.client, ownerA.companyId, [busyEmployee.id], day, 'Phase 8 Konflikt');
    const candidates = await office.client.rpc('list_replacement_candidates', { p_job_id: jobId }); expect(candidates.error).toBeNull();
    const candidateIds = ((candidates.data ?? []) as { member_id: string }[]).map((item) => item.member_id);
    expect(candidateIds).toContain(replacement.id);
    expect(candidateIds).not.toContain(absentEmployee.id);
    expect(candidateIds).not.toContain(busyEmployee.id);
    const affected = await office.client.rpc('list_absence_affected_assignments', { p_from: day, p_to: day });
    expect(((affected.data ?? []) as { job_id: string; member_id: string }[]).some((item) => item.job_id === jobId && item.member_id === absentEmployee.id)).toBe(true);
    expect((await absentEmployee.client.rpc('reassign_absence_affected_job', { p_job_id: jobId, p_from_member_id: absentEmployee.id, p_to_member_id: replacement.id })).error).not.toBeNull();
    expect((await office.client.rpc('reassign_absence_affected_job', { p_job_id: jobId, p_from_member_id: absentEmployee.id, p_to_member_id: replacement.id })).error).toBeNull();
    expect((await ownerA.client.from('job_assignments').select('member_id').eq('job_id', jobId)).data).toEqual(expect.arrayContaining([{ member_id: replacement.id }]));
    expect((await ownerA.client.from('job_assignment_changes').select('id').eq('job_id', jobId)).data).toHaveLength(1);
    expect((await replacement.client.from('in_app_notifications').select('type').eq('job_id', jobId)).data?.some((item) => item.type === 'REPLACEMENT_ASSIGNED')).toBe(true);
    expect((await ownerB.client.from('in_app_notifications').select('id').eq('job_id', jobId)).data).toEqual([]);
  });
});
