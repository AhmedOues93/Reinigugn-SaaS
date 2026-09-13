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
  const { data: object, error: objectError } = await client.from('cleaning_objects').insert({ company_id: companyId, customer_id: customer!.id, name: `${label} Objekt`, street: 'Teststraße 1', postal_code: '10115', city: 'Berlin' }).select('id').single();
  expect(objectError).toBeNull();
  return { customerId: customer!.id as string, objectId: object!.id as string };
}

async function createJob(client: SupabaseClient, customerId: string, objectId: string, date: string, memberIds: string[], status: 'PLANNED' | 'CONFIRMED' | 'CANCELLED' = 'PLANNED') {
  return client.rpc('create_single_job', {
    p_customer_id: customerId, p_cleaning_object_id: objectId, p_title: 'Phase 4 Testauftrag', p_description: '', p_scheduled_date: date, p_start_time: '18:00', p_end_time: '20:00', p_status: status, p_priority: 'NORMAL', p_internal_notes: '', p_employee_instructions: 'Zugang über Empfang', p_member_ids: memberIds,
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

    const { data: template, error: templateError } = await ownerA.client.from('checklist_templates').insert({ company_id: ownerA.companyId, name: 'Phase 6A Büro', description: 'Standardreinigung' }).select('id, is_active').single();
    expect(templateError).toBeNull();
    const { error: itemsError } = await ownerA.client.from('checklist_template_items').insert([
      { template_id: template!.id, position: 1, title: 'Boden saugen', is_required: true },
      { template_id: template!.id, position: 2, title: 'Fenster prüfen', is_required: false },
    ]);
    expect(itemsError).toBeNull();
    const { data: persistedItems } = await ownerA.client.from('checklist_template_items').select('position, is_required').eq('template_id', template!.id).order('position');
    expect(persistedItems).toEqual([{ position: 1, is_required: true }, { position: 2, is_required: false }]);
    const { error: ownerEditError } = await ownerA.client.from('checklist_templates').update({ description: 'Vom OWNER bearbeitet' }).eq('id', template!.id);
    expect(ownerEditError).toBeNull();
    const { error: officeEditError } = await office.client.from('checklist_templates').update({ name: 'Phase 6A Büro bearbeitet' }).eq('id', template!.id);
    expect(officeEditError).toBeNull();
    const { error: archiveError } = await ownerA.client.from('checklist_templates').update({ is_active: false }).eq('id', template!.id);
    expect(archiveError).toBeNull();
    const { error: reactivateError } = await ownerA.client.from('checklist_templates').update({ is_active: true }).eq('id', template!.id);
    expect(reactivateError).toBeNull();
    const { error: objectTemplateError } = await ownerA.client.from('cleaning_objects').update({ checklist_template_id: template!.id }).eq('id', objectA);
    expect(objectTemplateError).toBeNull();
    const { error: employeeTemplateError } = await employeeA.client.from('checklist_templates').insert({ company_id: ownerA.companyId, name: 'Nicht erlaubt' });
    expect(employeeTemplateError).not.toBeNull();
    const { data: foreignTemplate } = await ownerB.client.from('checklist_templates').select('id').eq('id', template!.id);
    expect(foreignTemplate).toEqual([]);

    const { data: employeeOptions, error: employeeOptionsError } = await ownerA.client
      .from('company_members')
      .select('id, profiles!company_members_profile_id_fkey(first_name, last_name)')
      .eq('company_id', ownerA.companyId).eq('role', 'EMPLOYEE').eq('status', 'ACTIVE').order('created_at');
    expect(employeeOptionsError).toBeNull();
    expect(employeeOptions).toHaveLength(2);

    const { data: officeJobId, error: officeJobError } = await createJob(office.client, customerA, objectA, jobDate, [employeeA.memberId]);
    expect(officeJobError).toBeNull();
    expect(officeJobId).toBeTruthy();
    const { data: jobChecklist, error: jobChecklistError } = await ownerA.client.from('job_checklists').select('id, template_id').eq('job_id', officeJobId!).single();
    expect(jobChecklistError).toBeNull();
    expect(jobChecklist?.template_id).toBe(template!.id);
    const { data: snapshotItems, error: snapshotItemsError } = await ownerA.client.from('job_checklist_items').select('id, position, title, instruction, is_required').eq('job_checklist_id', jobChecklist!.id).order('position');
    expect(snapshotItemsError).toBeNull();
    expect(snapshotItems).toEqual([
      { id: expect.any(String), position: 1, title: 'Boden saugen', instruction: null, is_required: true },
      { id: expect.any(String), position: 2, title: 'Fenster prüfen', instruction: null, is_required: false },
    ]);
    const { error: templateItemEditError } = await ownerA.client.from('checklist_template_items').update({ title: 'Vorlage später geändert' }).eq('template_id', template!.id).eq('position', 1);
    expect(templateItemEditError).toBeNull();
    const { data: stableSnapshot } = await ownerA.client.from('job_checklist_items').select('title').eq('id', snapshotItems![0]!.id).single();
    expect(stableSnapshot?.title).toBe('Boden saugen');
    const { data: assignedEmployeeChecklist } = await employeeA.client.from('job_checklists').select('id').eq('job_id', officeJobId!);
    expect(assignedEmployeeChecklist).toHaveLength(1);
    const { data: unassignedEmployeeChecklist } = await employeeB.client.from('job_checklists').select('id').eq('job_id', officeJobId!);
    expect(unassignedEmployeeChecklist).toEqual([]);
    const { error: completeChecklistError } = await employeeA.client.rpc('complete_my_checklist_item', { p_item_id: snapshotItems![0]!.id, p_completed: true });
    expect(completeChecklistError).toBeNull();
    const { data: completedItem } = await ownerA.client.from('job_checklist_items').select('completed_at, completed_by').eq('id', snapshotItems![0]!.id).single();
    expect(completedItem?.completed_at).not.toBeNull();
    expect(completedItem?.completed_by).toBe(employeeA.memberId);
    const { error: employeeChecklistEditError } = await employeeA.client.from('job_checklist_items').update({ title: 'Unzulässig', instruction: 'Unzulässig', position: 9, is_required: false }).eq('id', snapshotItems![0]!.id);
    expect(employeeChecklistEditError).not.toBeNull();
    const { data: crossCompanyChecklist } = await ownerB.client.from('job_checklists').select('id').eq('job_id', officeJobId!);
    expect(crossCompanyChecklist).toEqual([]);
    const firstPhotoPath = `${ownerA.companyId}/${officeJobId}/${randomUUID()}.png`;
    const image = new File([new Uint8Array([137, 80, 78, 71])], 'einsatz.png', { type: 'image/png' });
    const { error: assignedPhotoUploadError } = await employeeA.client.storage.from('job-photos').upload(firstPhotoPath, image, { contentType: 'image/png' });
    expect(assignedPhotoUploadError).toBeNull();
    const { data: firstPhotoId, error: firstPhotoMetadataError } = await employeeA.client.rpc('create_my_job_photo_metadata', { p_job_id: officeJobId!, p_storage_path: firstPhotoPath, p_category: 'BEFORE', p_checklist_item_id: snapshotItems![0]!.id, p_description: 'Vor der Reinigung' });
    expect(firstPhotoMetadataError).toBeNull();
    expect(firstPhotoId).toBeTruthy();
    const { data: ownerPhotos } = await ownerA.client.from('job_photos').select('id, category, checklist_item_id').eq('job_id', officeJobId!);
    expect(ownerPhotos).toHaveLength(1);
    expect(ownerPhotos?.[0]).toMatchObject({ id: firstPhotoId, category: 'BEFORE', checklist_item_id: snapshotItems![0]!.id });
    const { data: ownerSignedPhoto, error: ownerSignedPhotoError } = await ownerA.client.storage.from('job-photos').createSignedUrl(firstPhotoPath, 60);
    expect(ownerSignedPhotoError).toBeNull();
    expect(ownerSignedPhoto?.signedUrl).toContain('/storage/v1/object/sign/');
    const { error: foreignSignedPhotoError } = await ownerB.client.storage.from('job-photos').createSignedUrl(firstPhotoPath, 60);
    expect(foreignSignedPhotoError).not.toBeNull();
    const { data: officePhotos } = await office.client.from('job_photos').select('id').eq('job_id', officeJobId!);
    expect(officePhotos).toHaveLength(1);
    const { data: unassignedPhotos } = await employeeB.client.from('job_photos').select('id').eq('job_id', officeJobId!);
    expect(unassignedPhotos).toEqual([]);
    const { error: unassignedPhotoUploadError } = await employeeB.client.storage.from('job-photos').upload(`${ownerA.companyId}/${officeJobId}/${randomUUID()}.png`, image, { contentType: 'image/png' });
    expect(unassignedPhotoUploadError).not.toBeNull();
    const { data: crossCompanyPhotos } = await ownerB.client.from('job_photos').select('id').eq('job_id', officeJobId!);
    expect(crossCompanyPhotos).toEqual([]);
    const { error: employeeDeleteOtherError } = await employeeB.client.rpc('delete_job_photo', { p_photo_id: firstPhotoId! });
    expect(employeeDeleteOtherError).not.toBeNull();
    const { data: ownPhotoPath, error: ownPhotoDeleteError } = await employeeA.client.rpc('delete_job_photo', { p_photo_id: firstPhotoId! });
    expect(ownPhotoDeleteError).toBeNull();
    const { error: ownStorageDeleteError } = await employeeA.client.storage.from('job-photos').remove([ownPhotoPath!]);
    expect(ownStorageDeleteError).toBeNull();
    const { data: deletedPhoto } = await ownerA.client.from('job_photos').select('id').eq('id', firstPhotoId!).maybeSingle();
    expect(deletedPhoto).toBeNull();
    const secondPhotoPath = `${ownerA.companyId}/${officeJobId}/${randomUUID()}.jpg`;
    const secondImage = new File([new Uint8Array([255, 216, 255])], 'abschluss.jpg', { type: 'image/jpeg' });
    const { error: secondPhotoUploadError } = await employeeA.client.storage.from('job-photos').upload(secondPhotoPath, secondImage, { contentType: 'image/jpeg' });
    expect(secondPhotoUploadError).toBeNull();
    const { data: secondPhotoId, error: secondPhotoMetadataError } = await employeeA.client.rpc('create_my_job_photo_metadata', { p_job_id: officeJobId!, p_storage_path: secondPhotoPath, p_category: 'AFTER', p_checklist_item_id: null, p_description: null });
    expect(secondPhotoMetadataError).toBeNull();
    const { data: staffPhotoPath, error: staffPhotoDeleteError } = await office.client.rpc('delete_job_photo', { p_photo_id: secondPhotoId! });
    expect(staffPhotoDeleteError).toBeNull();
    const { error: staffStorageDeleteError } = await office.client.storage.from('job-photos').remove([staffPhotoPath!]);
    expect(staffStorageDeleteError).toBeNull();
    const { data: jobsWithRelations, error: jobsWithRelationsError } = await ownerA.client
      .from('jobs')
      .select('id, customers(name), cleaning_objects(name, city), job_assignments(member_id, company_members(profiles!company_members_profile_id_fkey(first_name, last_name)))')
      .eq('company_id', ownerA.companyId);
    expect(jobsWithRelationsError).toBeNull();
    expect(jobsWithRelations?.[0]?.job_assignments).toHaveLength(1);

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

    const { error: unassignedStartError } = await employeeB.client.rpc('start_my_job', { p_job_id: officeJobId! });
    expect(unassignedStartError).not.toBeNull();
    const { data: timeEntryId, error: startError } = await employeeA.client.rpc('start_my_job', { p_job_id: officeJobId! });
    expect(startError).toBeNull();
    const { error: duplicateStartError } = await employeeA.client.rpc('start_my_job', { p_job_id: officeJobId! });
    expect(duplicateStartError).not.toBeNull();
    const { data: ownEntries, error: ownEntriesError } = await employeeA.client.from('job_time_entries').select('id, member_id, finished_at').eq('id', timeEntryId!);
    expect(ownEntriesError).toBeNull();
    expect(ownEntries).toHaveLength(1);
    const { data: foreignEntries } = await employeeB.client.from('job_time_entries').select('id').eq('id', timeEntryId!);
    expect(foreignEntries).toEqual([]);
    const { error: stopError } = await employeeA.client.rpc('stop_my_job', { p_job_id: officeJobId! });
    expect(stopError).toBeNull();
    const { data: stoppedEntry } = await ownerA.client.from('job_time_entries').select('started_at, finished_at, duration_minutes').eq('id', timeEntryId!).single();
    expect(stoppedEntry?.finished_at).not.toBeNull();
    expect(stoppedEntry?.duration_minutes).toBeGreaterThanOrEqual(0);
    const correctedEnd = new Date(new Date(stoppedEntry!.started_at).getTime() + 60_000).toISOString();
    const { error: correctionError } = await ownerA.client.rpc('correct_time_entry', { p_time_entry_id: timeEntryId!, p_started_at: stoppedEntry!.started_at, p_finished_at: correctedEnd, p_reason: 'Testkorrektur' });
    expect(correctionError).toBeNull();
    const { data: auditLogs, error: auditError } = await ownerA.client.from('time_entry_audit_logs').select('id').eq('time_entry_id', timeEntryId!);
    expect(auditError).toBeNull();
    expect(auditLogs).toHaveLength(1);

    const serviceRecordDate = dateIn(6);
    const { data: serviceRecordJobId, error: serviceRecordJobError } = await createJob(ownerA.client, customerA, objectA, serviceRecordDate, [employeeA.memberId, employeeB.memberId]);
    expect(serviceRecordJobError).toBeNull();
    const { error: firstServiceStartError } = await employeeA.client.rpc('start_my_job', { p_job_id: serviceRecordJobId! });
    expect(firstServiceStartError).toBeNull();
    const { error: secondServiceStartError } = await employeeB.client.rpc('start_my_job', { p_job_id: serviceRecordJobId! });
    expect(secondServiceStartError).toBeNull();
    const { error: firstServiceStopError } = await employeeA.client.rpc('stop_my_job', { p_job_id: serviceRecordJobId! });
    expect(firstServiceStopError).toBeNull();
    const { error: secondServiceStopError } = await employeeB.client.rpc('stop_my_job', { p_job_id: serviceRecordJobId! });
    expect(secondServiceStopError).toBeNull();
    const { data: serviceRecordJob, error: serviceRecordJobQüryError } = await ownerA.client.from('jobs').select('id, title, scheduled_date, planned_start_at, planned_end_at, customers(name), cleaning_objects(name, street, postal_code, city)').eq('id', serviceRecordJobId!).single();
    expect(serviceRecordJobQüryError).toBeNull();
    expect(serviceRecordJob).toMatchObject({ id: serviceRecordJobId, title: 'Phase 4 Testauftrag', scheduled_date: serviceRecordDate });
    const { data: serviceRecordTimes } = await ownerA.client.from('job_time_entries').select('member_id, started_at, finished_at, duration_minutes').eq('job_id', serviceRecordJobId!).order('started_at');
    expect(serviceRecordTimes).toHaveLength(2);
    expect(serviceRecordTimes?.every((entry) => entry.finished_at !== null && entry.duration_minutes !== null)).toBe(true);
    const { data: foreignServiceRecord } = await ownerB.client.from('jobs').select('id, job_time_entries(id), job_checklists(id), job_photos(id)').eq('id', serviceRecordJobId!);
    expect(foreignServiceRecord).toEqual([]);

    const { data: secondJobId, error: secondJobError } = await createJob(ownerA.client, customerA, objectA, dateIn(3), [employeeB.memberId], 'CANCELLED');
    expect(secondJobError).toBeNull();
    const { data: employeeJobs, error: employeeJobsError } = await employeeA.client.from('jobs').select('id').order('planned_start_at');
    expect(employeeJobsError).toBeNull();
    expect(employeeJobs?.map((job) => job.id)).toContain(officeJobId);
    expect(employeeJobs?.map((job) => job.id)).not.toContain(secondJobId);

    const scheduleStart = dateIn(4);
    const { data: schedule, error: scheduleError } = await ownerA.client.from('service_schedules').insert({ company_id: ownerA.companyId, customer_id: customerA, cleaning_object_id: objectA, checklist_template_id: template!.id, name: 'Phase 4 Regelreinigung', valid_from: scheduleStart }).select('id, checklist_template_id').single();
    expect(scheduleError).toBeNull();
    expect(schedule?.checklist_template_id).toBe(template!.id);
    const { error: ruleError } = await ownerA.client.from('schedule_rules').insert({ service_schedule_id: schedule!.id, weekday: isoWeekday(scheduleStart), planned_start_time: '07:00', planned_end_time: '08:00' });
    expect(ruleError).toBeNull();
    const { error: scheduleAssignmentError } = await ownerA.client.from('service_schedule_assignments').insert({ company_id: ownerA.companyId, service_schedule_id: schedule!.id, member_id: employeeA.memberId });
    expect(scheduleAssignmentError).toBeNull();
    const horizon = dateIn(56);
    const { error: firstGenerationError } = await ownerA.client.rpc('generate_jobs_for_schedule', { p_schedule_id: schedule!.id, p_until: horizon });
    expect(firstGenerationError).toBeNull();
    const { count: generatedCount } = await ownerA.client.from('jobs').select('*', { count: 'exact', head: true }).eq('service_schedule_id', schedule!.id);
    expect(generatedCount).toBeGreaterThan(0);
    const { data: generatedJob } = await ownerA.client.from('jobs').select('id').eq('service_schedule_id', schedule!.id).order('scheduled_date').limit(1).single();
    const { data: generatedChecklist } = await ownerA.client.from('job_checklists').select('template_id').eq('job_id', generatedJob!.id).single();
    expect(generatedChecklist?.template_id).toBe(template!.id);
    const { error: secondGenerationError } = await ownerA.client.rpc('generate_jobs_for_schedule', { p_schedule_id: schedule!.id, p_until: horizon });
    expect(secondGenerationError).toBeNull();
    const { count: repeatedCount } = await ownerA.client.from('jobs').select('*', { count: 'exact', head: true }).eq('service_schedule_id', schedule!.id);
    expect(repeatedCount).toBe(generatedCount);
    const { data: completedJob } = await ownerA.client.from('jobs').select('id, title').eq('service_schedule_id', schedule!.id).order('scheduled_date').limit(1).single();
    const { error: completeError } = await ownerA.client.from('jobs').update({ status: 'COMPLETED' }).eq('id', completedJob!.id);
    expect(completeError).toBeNull();
    await ownerA.client.from('service_schedules').update({ name: 'Geänderte Regelreinigung' }).eq('id', schedule!.id);
    await ownerA.client.rpc('generate_jobs_for_schedule', { p_schedule_id: schedule!.id, p_until: horizon });
    const { data: preservedJob } = await ownerA.client.from('jobs').select('title, status').eq('id', completedJob!.id).single();
    expect(preservedJob).toEqual({ title: completedJob!.title, status: 'COMPLETED' });
  });
});
