'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { type FormState } from '@/lib/actions';
import { requireStaffCompany } from '@/lib/auth';

/**
 * Sales actions. Each confirms an OWNER/OFFICE session and then calls a
 * security-definer function that re-derives the tenant from the membership, so
 * a forged lead, survey or quote id cannot reach another company. Prices are
 * never totalled here: the database computes every amount.
 */
function failure(message: string): FormState {
  return { status: 'error', message };
}

function revalidateSales(paths: string[] = []) {
  revalidatePath('/dashboard/vertrieb/anfragen');
  revalidatePath('/dashboard/vertrieb/besichtigungen');
  revalidatePath('/dashboard/vertrieb/angebote');
  for (const path of paths) revalidatePath(path);
}

function toCents(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? '').replace(',', '.').trim();
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1_000_000) return null;
  return Math.round(parsed * 100);
}

export async function createLead(_: FormState, formData: FormData): Promise<FormState> {
  const customerMode = String(formData.get('customer_mode') ?? 'NEW');
  const customerId = String(formData.get('customer_id') ?? '').trim();
  const cleaningType = String(formData.get('cleaning_type') ?? '').trim();
  const frequency = String(formData.get('frequency') ?? '').trim();
  const preferredTime = String(formData.get('preferred_time') ?? '').trim();
  const desiredStart = String(formData.get('desired_start') ?? '').trim();

  let organisation = String(formData.get('organisation') ?? '').trim();
  let contactPerson = String(formData.get('contact_person') ?? '').trim();
  let email = String(formData.get('email') ?? '').trim();
  let phone = String(formData.get('phone') ?? '').trim();
  let street = String(formData.get('street') ?? '').trim();
  let postalCode = String(formData.get('postal_code') ?? '').trim();
  let city = String(formData.get('city') ?? '').trim();

  try {
    const { supabase, company } = await requireStaffCompany();

    if (customerMode === 'EXISTING') {
      if (!customerId) return failure('Bitte wählen Sie einen bestehenden Kunden aus.');
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .select('id, name, contact_person, email, phone, billing_address, postal_code, city, is_active')
        .eq('company_id', company.id)
        .eq('id', customerId)
        .eq('is_active', true)
        .maybeSingle();

      if (customerError || !customer) return failure('Der ausgewählte Kunde ist nicht verfügbar.');
      organisation = customer.name;
      contactPerson = customer.contact_person ?? '';
      email = customer.email ?? '';
      phone = customer.phone ?? '';
      street = customer.billing_address ?? '';
      postalCode = customer.postal_code ?? '';
      city = customer.city ?? '';
    } else if (customerMode !== 'NEW') {
      return failure('Bitte wählen Sie einen gültigen Kundentyp.');
    }

    if (organisation.length < 2 || organisation.length > 160) {
      return failure('Bitte geben Sie einen Firmen- oder Objektnamen an.');
    }

    const structuredNotes = [
      cleaningType && `Reinigungsart: ${cleaningType}`,
      frequency && `Turnus: ${frequency}`,
      preferredTime && `Bevorzugte Ausführungszeit: ${preferredTime}`,
      desiredStart && `Gewünschter Start: ${desiredStart}`,
      String(formData.get('notes') ?? '').trim(),
    ].filter(Boolean).join('\n');

    const { data, error } = await supabase.rpc('create_lead', {
      p_organisation: organisation,
      p_contact_person: contactPerson,
      p_email: email,
      p_phone: phone,
      p_street: street,
      p_postal_code: postalCode,
      p_city: city,
      p_source: customerMode === 'EXISTING' ? 'Bestandskunde' : String(formData.get('source') ?? ''),
      p_notes: structuredNotes,
    });
    if (error || !data) return failure('Die Anfrage konnte nicht angelegt werden.');

    revalidateSales();
    redirect(`/dashboard/vertrieb/anfragen/${data as string}`);
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) throw error;
    return failure('Die Anfrage konnte nicht angelegt werden.');
  }
}

export async function setLeadStatus(leadId: string, _: FormState, formData: FormData): Promise<FormState> {
  const status = String(formData.get('status') ?? '');
  const reason = String(formData.get('lost_reason') ?? '').trim();
  if (!['CONTACTED', 'LOST'].includes(status)) return failure('Bitte wählen Sie einen gültigen Status.');
  if (status === 'LOST' && reason.length < 3) return failure('Bitte geben Sie einen Absagegrund an.');
  try {
    const { supabase } = await requireStaffCompany();
    const { error } = await supabase.rpc('set_lead_status', {
      p_lead_id: leadId,
      p_status: status,
      p_lost_reason: status === 'LOST' ? reason : null,
    });
    if (error) return failure('Der Status konnte nicht geändert werden.');
  } catch {
    return failure('Der Status konnte nicht geändert werden.');
  }
  revalidateSales([`/dashboard/vertrieb/anfragen/${leadId}`]);
  return { status: 'success', message: 'Status aktualisiert.' };
}

export async function scheduleSurvey(leadId: string | null, _: FormState, formData: FormData): Promise<FormState> {
  const siteName = String(formData.get('site_name') ?? '').trim();
  const scheduledAt = String(formData.get('scheduled_at') ?? '');
  const customerId = String(formData.get('customer_id') ?? '').trim() || null;
  if (siteName.length < 2) return failure('Bitte geben Sie einen Objektnamen an.');
  if (!scheduledAt) return failure('Bitte geben Sie einen Termin an.');
  if (!leadId && !customerId) return failure('Eine Besichtigung braucht eine Anfrage oder einen Kunden.');

  let id: string;
  try {
    const { supabase } = await requireStaffCompany();
    const { data, error } = await supabase.rpc('schedule_site_survey', {
      p_lead_id: leadId,
      p_customer_id: leadId ? null : customerId,
      p_site_name: siteName,
      p_scheduled_at: new Date(scheduledAt).toISOString(),
      p_conducted_by: String(formData.get('conducted_by') ?? '').trim() || null,
      p_street: String(formData.get('street') ?? ''),
      p_postal_code: String(formData.get('postal_code') ?? ''),
      p_city: String(formData.get('city') ?? ''),
      p_access_notes: String(formData.get('access_notes') ?? ''),
    });
    if (error || !data) return failure('Die Besichtigung konnte nicht geplant werden.');
    id = data as string;
  } catch {
    return failure('Die Besichtigung konnte nicht geplant werden.');
  }
  revalidateSales([`/dashboard/vertrieb/anfragen/${leadId}`]);
  redirect(`/dashboard/vertrieb/besichtigungen/${id}`);
}

export async function addSurveyArea(surveyId: string, _: FormState, formData: FormData): Promise<FormState> {
  const name = String(formData.get('name') ?? '').trim();
  const minutes = Number(String(formData.get('minutes_per_service') ?? ''));
  const perWeek = Number(String(formData.get('services_per_week') ?? '1').replace(',', '.'));
  const sqmRaw = String(formData.get('area_sqm') ?? '').replace(',', '.').trim();
  if (!name) return failure('Bitte geben Sie einen Bereichsnamen an.');
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 10_000) return failure('Bitte geben Sie gültige Minuten an.');
  if (!Number.isFinite(perWeek) || perWeek <= 0 || perWeek > 21) return failure('Bitte geben Sie gültige Einsätze pro Woche an.');

  try {
    const { supabase } = await requireStaffCompany();
    const { error } = await supabase.rpc('add_survey_area', {
      p_survey_id: surveyId,
      p_name: name,
      p_area_sqm: sqmRaw ? Number(sqmRaw) : null,
      p_floor_type: String(formData.get('floor_type') ?? ''),
      p_services_per_week: perWeek,
      p_minutes_per_service: Math.round(minutes),
      p_hourly_rate_cents: toCents(formData.get('hourly_rate')),
      p_notes: String(formData.get('notes') ?? ''),
    });
    if (error) return failure('Die Fläche konnte nicht gespeichert werden.');
  } catch {
    return failure('Die Fläche konnte nicht gespeichert werden.');
  }
  revalidateSales([`/dashboard/vertrieb/besichtigungen/${surveyId}`]);
  return { status: 'success', message: 'Fläche aufgenommen.' };
}

export async function removeSurveyArea(surveyId: string, areaId: string): Promise<void> {
  const { supabase } = await requireStaffCompany();
  const { error } = await supabase.rpc('remove_survey_area', { p_area_id: areaId });
  if (error) throw new Error('Die Fläche konnte nicht entfernt werden.');
  revalidateSales([`/dashboard/vertrieb/besichtigungen/${surveyId}`]);
}

export async function completeSurvey(surveyId: string, _: FormState, formData: FormData): Promise<FormState> {
  try {
    const { supabase } = await requireStaffCompany();
    const { error } = await supabase.rpc('complete_site_survey', {
      p_survey_id: surveyId,
      p_findings: String(formData.get('findings') ?? ''),
    });
    if (error) return failure('Die Besichtigung konnte nicht abgeschlossen werden.');
  } catch {
    return failure('Die Besichtigung konnte nicht abgeschlossen werden.');
  }
  revalidateSales([`/dashboard/vertrieb/besichtigungen/${surveyId}`]);
  return { status: 'success', message: 'Besichtigung abgeschlossen.' };
}

export async function createQuoteFromSurvey(surveyId: string, _: FormState, formData: FormData): Promise<FormState> {
  const title = String(formData.get('title') ?? '').trim();
  const validDays = Number(String(formData.get('valid_days') ?? '30'));
  if (title.length < 2) return failure('Bitte geben Sie einen Angebotstitel an.');

  let id: string;
  try {
    const { supabase } = await requireStaffCompany();
    const { data, error } = await supabase.rpc('create_quote_from_survey', {
      p_survey_id: surveyId,
      p_title: title,
      p_valid_days: Number.isFinite(validDays) ? Math.round(validDays) : 30,
    });
    if (error || !data) {
      return failure(
        error?.message.includes('No hourly rate')
          ? 'Für mindestens eine Fläche fehlt ein Stundensatz. Hinterlegen Sie einen Satz an der Fläche oder als Firmenstandard.'
          : 'Das Angebot konnte nicht erstellt werden.',
      );
    }
    id = data as string;
  } catch {
    return failure('Das Angebot konnte nicht erstellt werden.');
  }
  revalidateSales([`/dashboard/vertrieb/besichtigungen/${surveyId}`]);
  redirect(`/dashboard/vertrieb/angebote/${id}`);
}

export async function addQuoteLine(quoteId: string, _: FormState, formData: FormData): Promise<FormState> {
  const description = String(formData.get('description') ?? '').trim();
  const quantity = Number(String(formData.get('quantity') ?? '').replace(',', '.'));
  const unitPrice = toCents(formData.get('unit_price'));
  const vatPercent = Number(String(formData.get('vat_rate') ?? '19').replace(',', '.'));
  const recurrence = String(formData.get('recurrence') ?? 'ONE_OFF');

  if (!description) return failure('Bitte geben Sie eine Beschreibung an.');
  if (!Number.isFinite(quantity) || quantity <= 0) return failure('Bitte geben Sie eine gültige Menge an.');
  if (unitPrice === null) return failure('Bitte geben Sie einen gültigen Einzelpreis an.');
  if (!Number.isFinite(vatPercent) || vatPercent < 0 || vatPercent > 100) return failure('Bitte geben Sie einen gültigen USt.-Satz an.');
  if (!['ONE_OFF', 'WEEKLY', 'MONTHLY'].includes(recurrence)) return failure('Bitte wählen Sie einen gültigen Turnus.');

  try {
    const { supabase } = await requireStaffCompany();
    const { error } = await supabase.rpc('add_quote_line', {
      p_quote_id: quoteId,
      p_description: description,
      p_quantity: quantity,
      p_unit: String(formData.get('unit') ?? 'Std'),
      p_unit_price_cents: unitPrice,
      p_vat_rate_basis_points: Math.round(vatPercent * 100),
      p_recurrence: recurrence,
    });
    if (error) return failure('Die Position konnte nicht hinzugefügt werden.');
  } catch {
    return failure('Die Position konnte nicht hinzugefügt werden.');
  }
  revalidateSales([`/dashboard/vertrieb/angebote/${quoteId}`]);
  return { status: 'success', message: 'Position hinzugefügt.' };
}

export async function removeQuoteLine(quoteId: string, lineId: string): Promise<void> {
  const { supabase } = await requireStaffCompany();
  const { error } = await supabase.rpc('remove_quote_line', { p_line_id: lineId });
  if (error) throw new Error('Die Position konnte nicht entfernt werden.');
  revalidateSales([`/dashboard/vertrieb/angebote/${quoteId}`]);
}

export async function sendQuote(quoteId: string, _: FormState, __: FormData): Promise<FormState> {
  try {
    const { supabase } = await requireStaffCompany();
    const { data, error } = await supabase.rpc('send_quote', { p_quote_id: quoteId });
    if (error) {
      return failure(
        error.message.includes('at least one line')
          ? 'Ein Angebot braucht mindestens eine Position.'
          : 'Das Angebot konnte nicht gesendet werden.',
      );
    }
    revalidateSales([`/dashboard/vertrieb/angebote/${quoteId}`]);
    return { status: 'success', message: `Angebot ${data} wurde gesendet.` };
  } catch {
    return failure('Das Angebot konnte nicht gesendet werden.');
  }
}

export async function declineQuote(quoteId: string, _: FormState, formData: FormData): Promise<FormState> {
  const reason = String(formData.get('reason') ?? '').trim();
  if (reason.length < 3) return failure('Bitte geben Sie einen Ablehnungsgrund an.');
  try {
    const { supabase } = await requireStaffCompany();
    const { error } = await supabase.rpc('decline_quote', { p_quote_id: quoteId, p_reason: reason });
    if (error) return failure('Das Angebot konnte nicht abgelehnt werden.');
  } catch {
    return failure('Das Angebot konnte nicht abgelehnt werden.');
  }
  revalidateSales([`/dashboard/vertrieb/angebote/${quoteId}`]);
  return { status: 'success', message: 'Angebot abgelehnt.' };
}

/**
 * Acceptance is the hinge of the workflow: one database call creates the
 * customer, the site and the recurring plan atomically.
 */
export async function acceptQuote(quoteId: string, _: FormState, formData: FormData): Promise<FormState> {
  const weekdays = formData
    .getAll('weekdays')
    .map((value) => Number(String(value)))
    .filter((value) => Number.isInteger(value) && value >= 1 && value <= 7);
  const start = String(formData.get('start_time') ?? '08:00');
  const end = String(formData.get('end_time') ?? '10:00');
  if (weekdays.length === 0) return failure('Bitte wählen Sie mindestens einen Wochentag.');
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end) || end <= start) {
    return failure('Bitte geben Sie ein gültiges Zeitfenster an.');
  }

  try {
    const { supabase } = await requireStaffCompany();
    const { error } = await supabase.rpc('accept_quote', {
      p_quote_id: quoteId,
      p_weekdays: weekdays,
      p_start_time: start,
      p_end_time: end,
    });
    if (error) return failure('Das Angebot konnte nicht angenommen werden.');
  } catch {
    return failure('Das Angebot konnte nicht angenommen werden.');
  }
  revalidateSales([`/dashboard/vertrieb/angebote/${quoteId}`]);
  revalidatePath('/dashboard/kunden');
  revalidatePath('/dashboard/planung');
  return { status: 'success', message: 'Angebot angenommen. Kunde, Objekt und Plan wurden angelegt.' };
}
