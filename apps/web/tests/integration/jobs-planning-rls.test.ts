import { createHash, randomBytes, randomUUID } from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

const url = process.env.TEST_SUPABASE_URL;
const key = process.env.TEST_SUPABASE_ANON_KEY;
const integration = url && key ? describe : describe.skip;
const password = 'Phase4-integration-password-2026';

function dateIn(days: number) { const value = new Date(); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
function isoWeekday(date: string) { const day = new Date(`${date}T12:00:00Z`).getUTCDay(); return day === 0 ? 7 : day; }

async function createOwner(label: string) {
  const client = createClient(url!, key!);
  const email = `${label}-${randomUUID()}@example.test`;
  const { data, error } = await client.auth.signUp({ email, password, options: { data: { first_name: label, last_name: 'Test' } } });
  expect(error).toBeNull();
  expect(data.session).not.toBeNull();
  const { data: company, error: companyError } = await client.rpc('create_company_for_current_user', { company_name: `${label} Reinigung` });
  expect(companyError).toBeNull();
  return { client, companyId: company!.id as string };
}

async function inviteMember(owner: SupabaseClient, role: 'OFFICE' | 'EMPLOYEE', label: string) {
  const email = `${label}-${randomUUID()}@example.test`;
  const token = randomBytes(32).toString('base64url');
  const { data: invitation, error } = await owner.rpc('create_employee_invitation', {
    p_email: email, p_first_name: label, p_last_name: 'Test', p_phone: '', p_role: role, p_employee_number: '', p_weekly_hours: null, p_employment_start_date: null, p_notes: '',
    p_token_hash: createHash('sha256').update(token).digest('hex'), p_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
  });
  expect(error).toBeNull();
  const client = createClient(url!, key!);
  const signUp = await client.auth.signUp({ email, password, options: { data: { first_name: label, last_name: 'Test' } } });
  expect(signUp.error).toBeNull();
  expect(signUp.data.session).not.toBeNull();
  const { data: memberId, error: acceptError } = await client.rpc('complete_company_invitation', { p_token: token });
  expect(acceptError).toBeNull();
  return { client, memberId: memberId as string, invitationId: invitation![0]!.invitation_id as string };
}

async function createCustomerAndObject(client: SupabaseClient, companyId: string, label: string) {
  const { data: customer, error: customerError } = await client.from('customers').insert({ company_id: companyId, name: `${label} Kunde` }).select('id').single();
  expect(customerError).toBeNull();
  const { data: object, error: objectError } = await client.from('cleaning_objects').insert({ company_id: companyId, customer_id: customer!.id, name: `${label} Objekt`, street: 'Teststrasse 1', postal_code: '10115', city: 'Berlin' }).select('id').single();
  expect(objectError).toBeNull();
  return { customerId: customer!.id as string, objectId: object!.id as string };
}

async function createJob(client: SupabaseClient, customerId: string, objectId: string, date: string, memberIds: string[], status: 'PLANNED' | 'CONFIRMED' | 'CANCELLED' = 'PLANNED') {
  return client.rpc('create_single_job', {
    p_customer_id: customerId, p_cleaning_object_id: objectId, p_title: 'Phase 4 Testauftrag', p_description: '', p_scheduled_date: date, p_start_time: '18:00', p_end_time: '20:00', p_status: status, p_priority: 'NORMAL', p_internal_notes: '', p_employee_instructions: 'Zugang ueber Empfang', p_member_ids: memberIds,
  });
}

integration('jobs, planning and RLS', () => {
  it('enforces operational roles, tenant boundaries, assignments, generation and conflicts', async () => {
    const ownerA = await createOwner('Phase4A');
    const ownerB = await createOwner('Phase4B');
    const [{ customerId: customerA, objectId: objectA }, { customerId: customerB, objectId: objectB }] = await Promise.all([
      createCustomerAndObject(ownerA.client, ownerA.companyId, 'Phase4A'),
      createCustomerAndObject(ownerB.client, ownerB.companyId, 'Phase4B'),
    ]);
    const office = await inviteMember(ownerA.client, 'OFFICE', 'Phase4Office');
    const employeeA = await inviteMember(ownerA.client, 'EMPLOYEE', 'Phase4EmployeeA');
    const employeeB = await inviteMember(ownerA.client, 'EMPLOYEE', 'Phase4EmployeeB');
    const jobDate = dateIn(2);

    const { data: officeJobId, error: officeJobError } = await createJob(office.client, customerA, objectA, jobDate, [employeeA.memberId]);
    expect(officeJobError).toBeNull();
    expect(officeJobId).toBeTruthy();

    const { error: employeeCreateError } = await createJob(employeeA.client, customerA, objectA, jobDate, []);
    expect(employeeCreateError).not.toBeNull();
    const { data: foreignJob } = await ownerB.client.from('jobs').select('id').eq('id', officeJobId!).maybeSingle();
    expect(foreignJob).toBeNull();
    const { error: mismatchedObjectError } = await createJob(ownerA.client, customerB, objectA, jobDate, []);
    expect(mismatchedObjectError).not.toBeNull();
    const { error: foreignEmployeeError } = await createJob(ownerB.client, customerB, objectB, jobDate, [employeeA.memberId]);
    expect(foreignEmployeeError).not.toBeNull();

    const { data: conflicts, error: conflictError } = await ownerA.client.rpc('find_job_assignment_conflicts', {
      p_company_id: ownerA.companyId, p_start: `${jobDate}T18:30:00+01:00`, p_end: `${jobDate}T19:30:00+01:00`, p_member_ids: [employeeA.memberId],
    });
    expect(conflictError).toBeNull();
    expect(conflicts?.some((conflict: { job_id: string }) => conflict.job_id === officeJobId)).toBe(true);

    const { data: secondJobId, error: secondJobError } = await createJob(ownerA.client, customerA, objectA, dateIn(3), [employeeB.memberId], 'CANCELLED');
    expect(secondJobError).toBeNull();
    const { data: employeeJobs, error: employeeJobsError } = await employeeA.client.from('jobs').select('id').order('planned_start_at');
    expect(employeeJobsError).toBeNull();
    expect(employeeJobs?.map((job) => job.id)).toContain(officeJobId);
    expect(employeeJobs?.map((job) => job.id)).not.toContain(secondJobId);

    const scheduleStart = dateIn(4);
    const { data: schedule, error: scheduleError } = await ownerA.client.from('service_schedules').insert({ company_id: ownerA.companyId, customer_id: customerA, cleaning_object_id: objectA, name: 'Phase 4 Regelreinigung', valid_from: scheduleStart }).select('id').single();
    expect(scheduleError).toBeNull();
    const { error: ruleError } = await ownerA.client.from('schedule_rules').insert({ service_schedule_id: schedule!.id, weekday: isoWeekday(scheduleStart), planned_start_time: '07:00', planned_end_time: '08:00' });
    expect(ruleError).toBeNull();
    const { error: scheduleAssignmentError } = await ownerA.client.from('service_schedule_assignments').insert({ company_id: ownerA.companyId, service_schedule_id: schedule!.id, member_id: employeeA.memberId });
    expect(scheduleAssignmentError).toBeNull();
    const horizon = dateIn(56);
    const { error: firstGenerationError } = await ownerA.client.rpc('generate_jobs_for_schedule', { p_schedule_id: schedule!.id, p_until: horizon });
    expect(firstGenerationError).toBeNull();
    const { count: generatedCount } = await ownerA.client.from('jobs').select('*', { count: 'exact', head: true }).eq('service_schedule_id', schedule!.id);
    expect(generatedCount).toBeGreaterThan(0);
    const { error: secondGenerationError } = await ownerA.client.rpc('generate_jobs_for_schedule', { p_schedule_id: schedule!.id, p_until: horizon });
    expect(secondGenerationError).toBeNull();
    const { count: repeatedCount } = await ownerA.client.from('jobs').select('*', { count: 'exact', head: true }).eq('service_schedule_id', schedule!.id);
    expect(repeatedCount).toBe(generatedCount);
    const { data: completedJob } = await ownerA.client.from('jobs').select('id, title').eq('service_schedule_id', schedule!.id).order('scheduled_date').limit(1).single();
    const { error: completeError } = await ownerA.client.from('jobs').update({ status: 'COMPLETED' }).eq('id', completedJob!.id);
    expect(completeError).toBeNull();
    await ownerA.client.from('service_schedules').update({ name: 'Geaenderte Regelreinigung' }).eq('id', schedule!.id);
    await ownerA.client.rpc('generate_jobs_for_schedule', { p_schedule_id: schedule!.id, p_until: horizon });
    const { data: preservedJob } = await ownerA.client.from('jobs').select('title, status').eq('id', completedJob!.id).single();
    expect(preservedJob).toEqual({ title: completedJob!.title, status: 'COMPLETED' });
  });
});
