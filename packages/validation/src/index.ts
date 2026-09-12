import { z } from 'zod';

export const emailSchema = z.string().trim().email('Bitte gib eine gueltige E-Mail-Adresse ein.');

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
  z.string().trim().email('Bitte gib eine gueltige E-Mail-Adresse ein.').max(254).optional(),
);

export const customerSchema = z.object({
  name: z.string().trim().min(2, 'Der Kundenname ist zu kurz.').max(160, 'Der Kundenname ist zu lang.'),
  customer_number: optionalText(64, 'Die Kundennummer'),
  contact_person: optionalText(160, 'Die Ansprechperson'),
  email: optionalEmail,
  phone: optionalText(64, 'Die Telefonnummer'),
  billing_address: optionalText(500, 'Die Rechnungsadresse'),
  city: optionalText(120, 'Der Ort'),
  postal_code: optionalText(16, 'Die Postleitzahl'),
  notes: optionalText(4_000, 'Die Notizen'),
});

export const cleaningObjectSchema = z.object({
  customer_id: z.string().uuid('Bitte waehle einen gueltigen Kunden aus.'),
  name: z.string().trim().min(2, 'Der Objektname ist zu kurz.').max(160, 'Der Objektname ist zu lang.'),
  street: optionalText(240, 'Die Strasse'),
  postal_code: optionalText(16, 'Die Postleitzahl'),
  city: optionalText(120, 'Der Ort'),
  contact_person: optionalText(160, 'Die Ansprechperson'),
  contact_phone: optionalText(64, 'Die Telefonnummer'),
  access_instructions: optionalText(4_000, 'Die Zugangshinweise'),
  cleaning_instructions: optionalText(4_000, 'Die Reinigungsanweisungen'),
  notes: optionalText(4_000, 'Die Notizen'),
});

const optionalHours = z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.coerce.number({ invalid_type_error: 'Bitte gib eine gueltige Wochenstundenzahl ein.' }).min(0, 'Die Wochenstunden duerfen nicht negativ sein.').max(168, 'Die Wochenstunden duerfen maximal 168 betragen.').optional(),
);

const optionalDate = z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Bitte gib ein gueltiges Datum ein.').optional(),
);

export const employeeRoleSchema = z.enum(['OFFICE', 'EMPLOYEE'], { errorMap: () => ({ message: 'Bitte waehle eine gueltige Rolle.' }) });

export const employeeInvitationSchema = z.object({
  first_name: z.string().trim().min(1, 'Bitte gib einen Vornamen ein.').max(120, 'Der Vorname ist zu lang.'),
  last_name: z.string().trim().min(1, 'Bitte gib einen Nachnamen ein.').max(120, 'Der Nachname ist zu lang.'),
  email: emailSchema,
  phone: optionalText(64, 'Die Telefonnummer'),
  role: employeeRoleSchema,
  employee_number: optionalText(64, 'Die Personalnummer'),
  weekly_hours: optionalHours,
  employment_start_date: optionalDate,
  notes: optionalText(4_000, 'Die Notizen'),
});

export const employeeUpdateSchema = employeeInvitationSchema.omit({ email: true });

export const invitationTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/, 'Der Einladungslink ist ungueltig.');

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Bitte gib eine gueltige Uhrzeit ein.');
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Bitte gib ein gueltiges Datum ein.');
const uuidArraySchema = z.array(z.string().uuid('Eine Mitarbeiterzuweisung ist ungueltig.')).default([]);

export const jobStatusSchema = z.enum(['PLANNED', 'CONFIRMED', 'CANCELLED']);
export const jobPrioritySchema = z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']);

export const jobSchema = z.object({
  customer_id: z.string().uuid('Bitte waehle einen gueltigen Kunden aus.'),
  cleaning_object_id: z.string().uuid('Bitte waehle ein gueltiges Objekt aus.'),
  title: z.string().trim().min(2, 'Der Auftragstitel ist zu kurz.').max(160, 'Der Auftragstitel ist zu lang.'),
  description: optionalText(4_000, 'Die Beschreibung'),
  scheduled_date: dateSchema,
  planned_start_time: timeSchema,
  planned_end_time: timeSchema,
  status: jobStatusSchema.default('PLANNED'),
  priority: jobPrioritySchema.default('NORMAL'),
  internal_notes: optionalText(4_000, 'Die interne Notiz'),
  employee_instructions: optionalText(4_000, 'Die Arbeitsanweisung'),
  member_ids: uuidArraySchema,
  confirm_conflicts: z.enum(['true']).optional(),
}).refine((value) => value.planned_end_time > value.planned_start_time, { message: 'Das geplante Ende muss nach dem Beginn liegen.', path: ['planned_end_time'] });

export const scheduleRuleSchema = z.object({
  id: z.preprocess((value) => typeof value === 'string' && value.trim() === '' ? undefined : value, z.string().uuid().optional()),
  weekday: z.coerce.number().int().min(1).max(7),
  planned_start_time: timeSchema,
  planned_end_time: timeSchema,
}).refine((value) => value.planned_end_time > value.planned_start_time, { message: 'Das geplante Ende muss nach dem Beginn liegen.', path: ['planned_end_time'] });

export const serviceScheduleSchema = z.object({
  customer_id: z.string().uuid('Bitte waehle einen gueltigen Kunden aus.'),
  cleaning_object_id: z.string().uuid('Bitte waehle ein gueltiges Objekt aus.'),
  name: z.string().trim().min(2, 'Der Planname ist zu kurz.').max(160, 'Der Planname ist zu lang.'),
  description: optionalText(4_000, 'Die Beschreibung'),
  valid_from: dateSchema,
  valid_until: optionalDate,
  member_ids: uuidArraySchema,
  rules: z.array(scheduleRuleSchema).min(1, 'Bitte hinterlege mindestens einen Wochentag.').max(7),
}).refine((value) => !value.valid_until || value.valid_until >= value.valid_from, { message: 'Das Enddatum darf nicht vor dem Startdatum liegen.', path: ['valid_until'] });
