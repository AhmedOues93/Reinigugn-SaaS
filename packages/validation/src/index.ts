import { z } from 'zod';

export const emailSchema = z.string().trim().email('Bitte gib eine gültige E-Mail-Adresse ein.');

export const passwordSchema = z
  .string()
  .min(12, 'Das Passwort muss mindestens 12 Zeichen lang sein.')
  .max(128, 'Das Passwort darf maximal 128 Zeichen lang sein.');

export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Bitte gib dein Passwort ein.'),
});

export const companyNameSchema = z.object({
  name: z.string().trim().min(2, 'Der Firmenname ist zu kurz.').max(120, 'Der Firmenname ist zu lang.'),
});

const optionalText = (maxLength: number, label: string) => z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().trim().max(maxLength, `${label} darf maximal ${maxLength} Zeichen lang sein.`).optional(),
);

const optionalEmail = z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().trim().email('Bitte gib eine gültige E-Mail-Adresse ein.').max(254).optional(),
);
const optionalUuid = z.preprocess((value) => typeof value === 'string' && value.trim() === '' ? undefined : value, z.string().uuid('Bitte wähle eine gültige Checkliste aus.').optional());

export const customerSchema = z.object({
  name: z.string().trim().min(2, 'Der Kundenname ist zu kurz.').max(160, 'Der Kundenname ist zu lang.'),
  customer_number: optionalText(64, 'Die Kundennummer'),
  contact_person: optionalText(160, 'Die Ansprechperson'),
  contact_first_name: optionalText(120, 'Der Vorname'),
  contact_last_name: optionalText(120, 'Der Nachname'),
  email: optionalEmail,
  phone: optionalText(64, 'Die Telefonnummer'),
  billing_address: optionalText(500, 'Die Rechnungsadresse'),
  city: optionalText(120, 'Der Ort'),
  postal_code: optionalText(16, 'Die Postleitzahl'),
  billing_country: optionalText(120, 'Das Land'),
  billing_email: optionalEmail,
  billing_recipient_name: optionalText(160, 'Der Rechnungsempfaenger'),
  billing_recipient_address: optionalText(500, 'Die abweichende Rechnungsadresse'),
  payment_terms_days: z.preprocess((value) => value === '' ? undefined : value, z.coerce.number().int().min(0).max(365).optional()),
  vat_id: optionalText(64, 'Die USt-IdNr.'),
  datev_debtor_account: z.preprocess(
    (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().trim().regex(/^\d{4,11}$/, 'Das DATEV-Debitorenkonto muss aus 4 bis 11 Ziffern bestehen.').optional(),
  ),
  notes: optionalText(4_000, 'Die Notizen'),
});

export const cleaningObjectSchema = z.object({
  customer_id: z.string().uuid('Bitte wähle einen gültigen Kunden aus.'),
  name: z.string().trim().min(2, 'Der Objektname ist zu kurz.').max(160, 'Der Objektname ist zu lang.'),
  object_number: optionalText(64, 'Die Objektnummer'),
  street: optionalText(240, 'Die Straße'),
  postal_code: optionalText(16, 'Die Postleitzahl'),
  city: optionalText(120, 'Der Ort'),
  country: optionalText(120, 'Das Land'),
  contact_person: optionalText(160, 'Die Ansprechperson'),
  contact_first_name: optionalText(120, 'Der Vorname'),
  contact_last_name: optionalText(120, 'Der Nachname'),
  contact_phone: optionalText(64, 'Die Telefonnummer'),
  contact_email: optionalEmail,
  area_sqm: z.preprocess((value) => value === '' ? undefined : value, z.coerce.number().positive('Die Flaeche muss positiv sein.').max(10_000_000).optional()),
  areas_description: optionalText(500, 'Die Bereiche'),
  access_instructions: optionalText(4_000, 'Die Zugangshinweise'),
  cleaning_instructions: optionalText(4_000, 'Die Reinigungsanweisungen'),
  notes: optionalText(4_000, 'Die Notizen'),
  checklist_template_id: optionalUuid,
});

const optionalHours = z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.coerce.number({ invalid_type_error: 'Bitte gib eine gültige Wochenstundenzahl ein.' }).min(0, 'Die Wochenstunden dürfen nicht negativ sein.').max(168, 'Die Wochenstunden dürfen maximal 168 betragen.').optional(),
);

const optionalDate = z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Bitte gib ein gültiges Datum ein.').optional(),
);

/** The five product locales, kept in one place so the schemas, the UI and the
 * database language constraints cannot drift apart. */
export const supportedLocaleSchema = z.enum(['de', 'en', 'ar', 'tr', 'uk', 'ru'], {
  errorMap: () => ({ message: 'Bitte wähle eine unterstützte Sprache.' }),
});

export const employeeRoleSchema = z.enum(['OFFICE', 'EMPLOYEE'], { errorMap: () => ({ message: 'Bitte wähle eine gültige Rolle.' }) });

const employeeMasterDataSchema = z.object({
  first_name: z.string().trim().min(1, 'Bitte gib einen Vornamen ein.').max(120, 'Der Vorname ist zu lang.'),
  last_name: z.string().trim().min(1, 'Bitte gib einen Nachnamen ein.').max(120, 'Der Nachname ist zu lang.'),
  phone: optionalText(64, 'Die Telefonnummer'),
  role: employeeRoleSchema,
  employee_number: optionalText(64, 'Die Personalnummer'),
  weekly_hours: optionalHours,
  employment_start_date: optionalDate,
  employment_end_date: optionalDate,
  employment_type: z.preprocess(
    (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.enum(['FULL_TIME', 'PART_TIME', 'MINIJOB', 'OTHER']).optional(),
  ),
  preferred_language: supportedLocaleSchema.default('de'),
  notes: optionalText(4_000, 'Die Notizen'),
});

function employmentDatesAreValid(value: { employment_start_date?: string; employment_end_date?: string }) {
  return !value.employment_end_date || !value.employment_start_date || value.employment_end_date >= value.employment_start_date;
}

export const employeeInvitationSchema = employeeMasterDataSchema
  .extend({ email: emailSchema })
  .refine(employmentDatesAreValid, {
    message: 'Das Austrittsdatum darf nicht vor dem Eintrittsdatum liegen.',
    path: ['employment_end_date'],
  });

/**
 * Editing an existing employee must not require a hidden e-mail field. The
 * login address belongs to the invitation/account and is shown read-only in
 * the form; employment master data can still be maintained before acceptance.
 */
export const employeeUpdateSchema = employeeMasterDataSchema.refine(employmentDatesAreValid, {
  message: 'Das Austrittsdatum darf nicht vor dem Eintrittsdatum liegen.',
  path: ['employment_end_date'],
});

export const customerPortalInvitationSchema = z.object({
  first_name: z.string().trim().min(1, 'Bitte gib einen Vornamen ein.').max(120, 'Der Vorname ist zu lang.'),
  last_name: z.string().trim().min(1, 'Bitte gib einen Nachnamen ein.').max(120, 'Der Nachname ist zu lang.'),
  email: emailSchema,
  phone: optionalText(64, 'Die Telefonnummer'),
});

export const invitationTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/, 'Der Einladungslink ist ungültig.');

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Bitte gib eine gültige Uhrzeit ein.');
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Bitte gib ein gültiges Datum ein.');
const uuidArraySchema = z.array(z.string().uuid('Eine Mitarbeiterzuweisung ist ungültig.')).default([]);

export const jobStatusSchema = z.enum(['PLANNED', 'CONFIRMED', 'CANCELLED']);
export const jobPrioritySchema = z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']);

export const jobSchema = z.object({
  customer_id: z.string().uuid('Bitte wähle einen gültigen Kunden aus.'),
  cleaning_object_id: z.string().uuid('Bitte wähle ein gültiges Objekt aus.'),
  title: z.string().trim().min(2, 'Der Auftragstitel ist zu kurz.').max(160, 'Der Auftragstitel ist zu lang.'),
  description: optionalText(4_000, 'Die Beschreibung'),
  scheduled_date: dateSchema,
  planned_start_time: timeSchema,
  planned_end_time: timeSchema,
  status: jobStatusSchema.default('PLANNED'),
  priority: jobPrioritySchema.default('NORMAL'),
  internal_notes: optionalText(4_000, 'Die interne Notiz'),
  employee_instructions: optionalText(4_000, 'Die Arbeitsanweisung'),
  checklist_template_id: optionalUuid,
  member_ids: uuidArraySchema,
  confirm_conflicts: z.enum(['true']).optional(),
}).refine((value) => value.planned_end_time > value.planned_start_time, { message: 'Das geplante Ende muss nach dem Beginn liegen.', path: ['planned_end_time'] });

export const scheduleRuleSchema = z.object({
  id: z.preprocess((value) => typeof value === 'string' && value.trim() === '' ? undefined : value, z.string().uuid().optional()),
  weekday: z.coerce.number().int().min(1).max(7),
  planned_start_time: timeSchema,
  planned_end_time: timeSchema,
}).refine((value) => value.planned_end_time > value.planned_start_time, { message: 'Das geplante Ende muss nach dem Beginn liegen.', path: ['planned_end_time'] });

/**
 * Whether a visit under this contract needs a Kundenabnahme, and how. It is a
 * commercial arrangement, so it is agreed once on the Leistungsplan — the
 * employee in the field is never asked to decide it.
 */
export const acceptancePolicySchema = z.enum([
  'KEINE_ABNAHME_ERFORDERLICH',
  'VOR_ORT_UNTERSCHRIFT',
  'PORTAL_ABNAHME',
]);

/**
 * How the agreed price is meant. Only STUNDENSATZ lets the working time the
 * cleaners record decide what the customer is charged; everything else is a
 * price that was agreed regardless of the clock.
 */
export const billingModeSchema = z.enum([
  'PAUSCHALE_PRO_EINSATZ',
  'STUNDENSATZ',
  'MONATSPAUSCHALE',
]);

export const serviceScheduleSchema = z.object({
  customer_id: z.string().uuid('Bitte wähle einen gültigen Kunden aus.'),
  cleaning_object_id: z.string().uuid('Bitte wähle ein gültiges Objekt aus.'),
  name: z.string().trim().min(2, 'Der Planname ist zu kurz.').max(160, 'Der Planname ist zu lang.'),
  description: optionalText(4_000, 'Die Beschreibung'),
  valid_from: dateSchema,
  valid_until: optionalDate,
  member_ids: uuidArraySchema,
  checklist_template_id: optionalUuid,
  acceptance_policy: acceptancePolicySchema.default('KEINE_ABNAHME_ERFORDERLICH'),
  billing_mode: billingModeSchema.default('PAUSCHALE_PRO_EINSATZ'),
  rules: z.array(scheduleRuleSchema).min(1, 'Bitte hinterlege mindestens einen Wochentag.').max(7),
}).refine((value) => !value.valid_until || value.valid_until >= value.valid_from, { message: 'Das Enddatum darf nicht vor dem Startdatum liegen.', path: ['valid_until'] });

const complaintPrioritySchema = z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']);
const complaintStatusSchema = z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']);

export const complaintSchema = z.object({
  customer_id: z.string().uuid('Bitte wähle einen gültigen Kunden aus.'),
  cleaning_object_id: z.string().uuid('Bitte wähle ein gültiges Objekt aus.'),
  job_id: optionalUuid,
  title: z.string().trim().min(2, 'Der Titel ist zu kurz.').max(160, 'Der Titel ist zu lang.'),
  description: z.string().trim().min(2, 'Bitte beschreibe die Reklamation.').max(4_000, 'Die Beschreibung ist zu lang.'),
  priority: complaintPrioritySchema.default('NORMAL'),
  status: complaintStatusSchema.default('OPEN'),
  assigned_member_id: optionalUuid,
  due_date: optionalDate,
  internal_note: optionalText(4_000, 'Die interne Notiz'),
});

export const qualityInspectionSchema = z.object({
  cleaning_object_id: z.string().uuid('Bitte wähle ein gültiges Objekt aus.'),
  job_id: optionalUuid,
  inspected_at: dateSchema,
  result: z.enum(['PASS', 'FAIL']),
  score: z.preprocess((value) => value === '' ? undefined : value, z.coerce.number().int().min(0).max(100).optional()),
  criteria: optionalText(4_000, 'Die Prüfkriterien'),
  notes: optionalText(4_000, 'Die Notizen'),
  follow_up_required: z.preprocess((value) => value === 'true' || value === 'on', z.boolean()),
});
