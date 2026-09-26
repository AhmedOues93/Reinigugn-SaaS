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

  const plan = (extra: Record<string, unknown> = {}) => ({
    customer_id: crypto.randomUUID(),
    cleaning_object_id: crypto.randomUUID(),
    name: 'Unterhaltsreinigung',
    valid_from: '2026-10-01',
    rules: [{ weekday: 1, planned_start_time: '18:00', planned_end_time: '20:00' }],
    ...extra,
  });

  // A plan that says nothing about acceptance asks nothing of the customer, and
  // a price that says nothing about its mode is a price per visit. Both
  // defaults are the ones that cannot surprise anybody: no approval nobody was
  // asked for, and no invoice inflated by the stopwatch.
  it('defaults a plan to no customer acceptance and a fixed price per visit', () => {
    const result = serviceScheduleSchema.parse(plan());
    expect(result.acceptance_policy).toBe('KEINE_ABNAHME_ERFORDERLICH');
    expect(result.billing_mode).toBe('PAUSCHALE_PRO_EINSATZ');
  });

  it('accepts the acceptance policies and billing modes the contract can carry', () => {
    expect(serviceScheduleSchema.parse(plan({ acceptance_policy: 'VOR_ORT_UNTERSCHRIFT' })).acceptance_policy).toBe('VOR_ORT_UNTERSCHRIFT');
    expect(serviceScheduleSchema.parse(plan({ acceptance_policy: 'PORTAL_ABNAHME' })).acceptance_policy).toBe('PORTAL_ABNAHME');
    expect(serviceScheduleSchema.parse(plan({ billing_mode: 'STUNDENSATZ' })).billing_mode).toBe('STUNDENSATZ');
    expect(serviceScheduleSchema.parse(plan({ billing_mode: 'MONATSPAUSCHALE' })).billing_mode).toBe('MONATSPAUSCHALE');
  });

  it('refuses an acceptance policy or billing mode it does not know', () => {
    expect(serviceScheduleSchema.safeParse(plan({ acceptance_policy: 'VIELLEICHT' })).success).toBe(false);
    expect(serviceScheduleSchema.safeParse(plan({ billing_mode: 'NACH_GEFUEHL' })).success).toBe(false);
  });
});

describe('Stundenlohn', () => {
  it('nimmt Komma und Punkt und rechnet in Cent', () => {
    const komma = employeeInvitationSchema.safeParse({
      first_name: 'Mira', last_name: 'Muster', email: 'mira@example.de', role: 'EMPLOYEE', hourly_wage_cents: '14,50',
    });
    const punkt = employeeInvitationSchema.safeParse({
      first_name: 'Mira', last_name: 'Muster', email: 'mira@example.de', role: 'EMPLOYEE', hourly_wage_cents: '14.50',
    });
    expect(komma.success && komma.data.hourly_wage_cents).toBe(1450);
    expect(punkt.success && punkt.data.hourly_wage_cents).toBe(1450);
  });

  it('laesst das Feld leer, statt null zu erfinden', () => {
    const leer = employeeInvitationSchema.safeParse({
      first_name: 'Mira', last_name: 'Muster', email: 'mira@example.de', role: 'EMPLOYEE', hourly_wage_cents: '',
    });
    expect(leer.success && leer.data.hourly_wage_cents).toBeUndefined();
  });

  it('weist einen negativen Satz ab', () => {
    expect(employeeInvitationSchema.safeParse({
      first_name: 'Mira', last_name: 'Muster', email: 'mira@example.de', role: 'EMPLOYEE', hourly_wage_cents: '-3',
    }).success).toBe(false);
  });
});
