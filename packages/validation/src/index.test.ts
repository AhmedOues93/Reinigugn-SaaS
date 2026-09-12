import { describe, expect, it } from 'vitest';
import { cleaningObjectSchema, companyNameSchema, customerSchema, employeeInvitationSchema, jobSchema, serviceScheduleSchema, signUpSchema } from './index';

describe('validation schemas', () => {
  it('accepts a valid signup', () => {
    expect(signUpSchema.safeParse({ email: 'owner@example.de', password: 'sehr-sicheres-passwort' }).success).toBe(true);
  });

  it('rejects an empty company name', () => {
    expect(companyNameSchema.safeParse({ name: ' ' }).success).toBe(false);
  });

  it('validates customer data and turns optional blanks into undefined', () => {
    const result = customerSchema.parse({ name: 'Muster GmbH', email: '', city: 'Berlin' });
    expect(result.email).toBeUndefined();
    expect(result.city).toBe('Berlin');
  });

  it('requires an object customer and name', () => {
    expect(cleaningObjectSchema.safeParse({ customer_id: 'invalid', name: '' }).success).toBe(false);
  });

  it('accepts a valid employee invitation', () => {
    expect(employeeInvitationSchema.safeParse({ first_name: 'Mira', last_name: 'Muster', email: 'mira@example.de', role: 'EMPLOYEE', weekly_hours: '30' }).success).toBe(true);
  });

  it('rejects OWNER as an invitation role', () => {
    expect(employeeInvitationSchema.safeParse({ first_name: 'Mira', last_name: 'Muster', email: 'mira@example.de', role: 'OWNER' }).success).toBe(false);
  });

  it('rejects a job ending before it starts', () => {
    expect(jobSchema.safeParse({ customer_id: crypto.randomUUID(), cleaning_object_id: crypto.randomUUID(), title: 'Abendreinigung', scheduled_date: '2026-09-14', planned_start_time: '20:00', planned_end_time: '18:00' }).success).toBe(false);
  });

  it('requires at least one structured recurrence rule', () => {
    expect(serviceScheduleSchema.safeParse({ customer_id: crypto.randomUUID(), cleaning_object_id: crypto.randomUUID(), name: 'Regelreinigung', valid_from: '2026-10-01', rules: [] }).success).toBe(false);
  });
});
