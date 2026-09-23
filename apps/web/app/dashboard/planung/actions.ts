'use server';

import { revalidatePath } from 'next/cache';
import { serviceScheduleSchema } from '@reinigung/validation';
import { type FormState } from '@/lib/actions';
import { requireStaffCompany } from '@/lib/auth';

const weekdays = [1, 2, 3, 4, 5, 6, 7];
function failure(message: string): FormState { return { status: 'error', message }; }
function scheduleInput(formData: FormData) {
  const rules = weekdays.flatMap((weekday) => formData.get(`weekday_${weekday}_enabled`) === 'true' ? [{ id: String(formData.get(`weekday_${weekday}_id`) ?? ''), weekday, planned_start_time: String(formData.get(`weekday_${weekday}_start`) ?? ''), planned_end_time: String(formData.get(`weekday_${weekday}_end`) ?? '') }] : []);
  return { ...Object.fromEntries(formData), member_ids: formData.getAll('member_ids').filter(Boolean), rules };
}
function horizon() { return new Date(Date.now() + 56 * 86_400_000).toISOString().slice(0, 10); }

async function saveSchedule(scheduleId: string | null, formData: FormData): Promise<FormState> {
  const parsed = serviceScheduleSchema.safeParse(scheduleInput(formData));
  const activateAfterSave = String(formData.get('activate_after_save') ?? '') === 'true';
  const assignmentMode = String(formData.get('assignment_mode') ?? 'AUTO') === 'MANUAL' ? 'MANUAL' : 'AUTO';
  if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? 'Bitte prüfe deine Eingaben.');
  try {
    const { supabase, company } = await requireStaffCompany();
    let id = scheduleId;
    let acceptancePolicy = parsed.data.acceptance_policy;
    let billingMode = parsed.data.billing_mode;

    if (scheduleId) {
      const { data: sourceQuote, error: sourceQuoteError } = await supabase
        .from('quotes')
        .select('acceptance_policy, billing_mode')
        .eq('company_id', company.id)
        .eq('created_schedule_id', scheduleId)
        .eq('status', 'ACCEPTED')
        .maybeSingle();
      if (sourceQuoteError) return failure('Die vereinbarten Angebotsbedingungen konnten nicht geprüft werden.');
      if (sourceQuote) {
        acceptancePolicy = sourceQuote.acceptance_policy;
        billingMode = sourceQuote.billing_mode;
      }
    }
    if (!id) {
      const { data, error } = await supabase.from('service_schedules').insert({ company_id: company.id, customer_id: parsed.data.customer_id, cleaning_object_id: parsed.data.cleaning_object_id, checklist_template_id: parsed.data.checklist_template_id ?? null, name: parsed.data.name, description: parsed.data.description ?? '', valid_from: parsed.data.valid_from, valid_until: parsed.data.valid_until ?? null, acceptance_policy: acceptancePolicy, billing_mode: billingMode, assignment_mode: assignmentMode, is_active: activateAfterSave }).select('id').single();
      if (error || !data) return failure('Der wiederkehrende Plan konnte nicht erstellt werden.');
      id = data.id;
    } else {
      const { error } = await supabase.from('service_schedules').update({ customer_id: parsed.data.customer_id, cleaning_object_id: parsed.data.cleaning_object_id, checklist_template_id: parsed.data.checklist_template_id ?? null, name: parsed.data.name, description: parsed.data.description ?? '', valid_from: parsed.data.valid_from, valid_until: parsed.data.valid_until ?? null, acceptance_policy: acceptancePolicy, billing_mode: billingMode, assignment_mode: assignmentMode, is_active: activateAfterSave }).eq('id', id).eq('company_id', company.id);
      if (error) return failure('Der wiederkehrende Plan konnte nicht aktualisiert werden.');
      await supabase.from('schedule_rules').update({ is_active: false }).eq('service_schedule_id', id);
      await supabase.from('service_schedule_assignments').delete().eq('service_schedule_id', id);
    }
    for (const rule of parsed.data.rules) {
      const suppliedId = (rule as typeof rule & { id?: string }).id;
      if (suppliedId && /^[0-9a-f-]{36}$/i.test(suppliedId)) await supabase.from('schedule_rules').update({ weekday: rule.weekday, planned_start_time: rule.planned_start_time, planned_end_time: rule.planned_end_time, is_active: true }).eq('id', suppliedId).eq('service_schedule_id', id);
      else await supabase.from('schedule_rules').insert({ service_schedule_id: id, weekday: rule.weekday, planned_start_time: rule.planned_start_time, planned_end_time: rule.planned_end_time, is_active: true });
    }
    if (!id) return failure('Der wiederkehrende Plan konnte nicht gespeichert werden.');
    if (assignmentMode === 'MANUAL' && parsed.data.member_ids.length) {
      await supabase.from('service_schedule_assignments').insert(
        parsed.data.member_ids.map((memberId) => ({
          company_id: company.id,
          service_schedule_id: id,
          member_id: memberId,
        })),
      );
    }
    if (assignmentMode === 'AUTO') {
      const { data: autoMember, error: autoError } = await supabase.rpc('auto_assign_schedule_employee', {
        p_schedule_id: id,
      });
      if (autoError) return failure('Der Plan wurde gespeichert, aber die automatische Teamplanung ist fehlgeschlagen.');
      if (!autoMember && activateAfterSave) {
        return failure('Kein passender Mitarbeiter mit freien Wochenstunden gefunden. Bitte Wochen-Sollstunden prüfen oder manuell zuweisen.');
      }
    }
    if (activateAfterSave) {
      const { error: generationError } = await supabase.rpc('generate_jobs_for_schedule', { p_schedule_id: id, p_until: horizon() });
      if (generationError) return failure('Der Plan wurde gespeichert, aber die Einsätze konnten nicht erzeugt werden.');
    }
    revalidatePath('/dashboard'); revalidatePath('/dashboard/planung'); revalidatePath('/dashboard/auftraege'); revalidatePath(`/dashboard/planung/plaene/${id}`);
    return { status: 'success', id, message: activateAfterSave
      ? assignmentMode === 'AUTO'
        ? 'Plan aktiviert. ReinPlan hat die Stammbesetzung nach freien Wochenstunden gewählt.'
        : 'Plan aktiviert. Einsätze und Teamzuweisungen wurden aktualisiert.'
      : 'Plan wurde gespeichert.' };
  } catch { return failure('Der wiederkehrende Plan konnte nicht gespeichert werden.'); }
}

export async function createServiceSchedule(_: FormState, formData: FormData) { return saveSchedule(null, formData); }
export async function updateServiceSchedule(id: string, _: FormState, formData: FormData) { return saveSchedule(id, formData); }
export async function setScheduleActive(id: string, isActive: boolean) {
  try {
    const { supabase, company } = await requireStaffCompany();
    const { data: schedule, error: loadError } = await supabase
      .from('service_schedules')
      .select('assignment_mode')
      .eq('id', id)
      .eq('company_id', company.id)
      .maybeSingle();
    if (loadError || !schedule) return { error: 'Der Planstatus konnte nicht aktualisiert werden.' };

    if (isActive && schedule.assignment_mode !== 'MANUAL') {
      const { data: autoMember, error: autoError } = await supabase.rpc('auto_assign_schedule_employee', {
        p_schedule_id: id,
      });
      if (autoError) return { error: 'Die automatische Teamplanung ist fehlgeschlagen.' };
      if (!autoMember) {
        return { error: 'Kein passender Mitarbeiter mit freien Wochenstunden gefunden. Bitte Stunden prüfen oder manuell zuweisen.' };
      }
    }

    const { error } = await supabase
      .from('service_schedules')
      .update({ is_active: isActive })
      .eq('id', id)
      .eq('company_id', company.id);
    if (error) return { error: 'Der Planstatus konnte nicht aktualisiert werden.' };

    if (isActive) {
      const { error: generationError } = await supabase.rpc('generate_jobs_for_schedule', {
        p_schedule_id: id,
        p_until: horizon(),
      });
      if (generationError) return { error: 'Der Plan wurde aktiviert, aber die Einsätze konnten nicht erzeugt werden.' };
    }

    revalidatePath('/dashboard/planung');
    revalidatePath('/dashboard/auftraege');
    revalidatePath(`/dashboard/planung/plaene/${id}`);
    return { error: null };
  } catch {
    return { error: 'Der Planstatus konnte nicht aktualisiert werden.' };
  }
}

/**
 * Roll every active plan's visits forward to the standard horizon.
 *
 * Generation is idempotent in the database, so this never duplicates a visit;
 * it only fills in the dates a plan has not reached yet. Offered from the
 * planning screen rather than run on page load, because writing during a GET
 * hides from the office that its standing contracts needed topping up.
 */
export async function extendScheduleHorizon() {
  try {
    const { supabase, company } = await requireStaffCompany();
    const { data, error } = await supabase
      .from('service_schedules')
      .select('id')
      .eq('company_id', company.id)
      .eq('is_active', true);
    if (error) return { error: 'Die Pläne konnten nicht geladen werden.' };

    for (const schedule of data ?? []) {
      const { error: generationError } = await supabase.rpc('generate_jobs_for_schedule', {
        p_schedule_id: schedule.id,
        p_until: horizon(),
      });
      if (generationError) return { error: 'Die Einsätze konnten nicht vollständig erzeugt werden.' };
    }

    revalidatePath('/dashboard');
    revalidatePath('/dashboard/planung');
    revalidatePath('/dashboard/auftraege');
    return { error: null };
  } catch {
    return { error: 'Die Einsätze konnten nicht erzeugt werden.' };
  }
}


/**
 * Builds the office-approved automatic plan for the selected week.
 * The database planner is the safety authority: it checks weekly capacity,
 * employment dates, approved vacation/sickness and overlapping work before
 * selecting anyone. Only AUTO schedules are changed.
 */
export async function createAutomaticWeekPlan(_: FormState, formData: FormData): Promise<FormState> {
  const weekStart = String(formData.get('week_start') ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return failure('Die ausgewählte Woche ist ungültig.');

  try {
    const { supabase, company } = await requireStaffCompany();
    const weekEndDate = new Date(`${weekStart}T12:00:00Z`);
    weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 6);
    const weekEnd = weekEndDate.toISOString().slice(0, 10);

    const { data: schedules, error: scheduleError } = await supabase
      .from('service_schedules')
      .select('id, name, valid_from, valid_until, assignment_mode')
      .eq('company_id', company.id)
      .eq('is_active', true)
      .eq('assignment_mode', 'AUTO')
      .lte('valid_from', weekEnd)
      .or(`valid_until.is.null,valid_until.gte.${weekStart}`);

    if (scheduleError) return failure('Die automatische Planung konnte nicht vorbereitet werden.');
    if (!schedules?.length) {
      return failure('Für diese Woche gibt es keine aktiven Pläne mit automatischer Teamplanung.');
    }

    let planned = 0;
    const unresolved: string[] = [];

    for (const schedule of schedules) {
      const { data: memberId, error: assignmentError } = await supabase.rpc('auto_assign_schedule_employee', {
        p_schedule_id: schedule.id,
      });
      if (assignmentError) {
        unresolved.push(schedule.name);
        continue;
      }
      if (!memberId) {
        unresolved.push(schedule.name);
        continue;
      }

      const { error: generationError } = await supabase.rpc('generate_jobs_for_schedule', {
        p_schedule_id: schedule.id,
        p_until: weekEnd,
      });
      if (generationError) {
        unresolved.push(schedule.name);
        continue;
      }
      planned += 1;
    }

    revalidatePath('/dashboard');
    revalidatePath('/dashboard/planung');
    revalidatePath('/dashboard/auftraege');

    if (unresolved.length) {
      return {
        status: planned ? 'success' : 'error',
        message: planned
          ? `${planned} automatische Pläne wurden aktualisiert. Für ${unresolved.length} Plan/Pläne wurde wegen Verfügbarkeit, Urlaub, Krankheit, Arbeitszeit oder Konflikten keine sichere Zuweisung vorgenommen: ${unresolved.slice(0, 3).join(', ')}${unresolved.length > 3 ? ' …' : ''}`
          : `Keine sichere automatische Zuweisung möglich. Bitte Verfügbarkeit, Urlaub/Krankheit, Wochenstunden und bestehende Einsätze prüfen.`,
      };
    }

    return {
      status: 'success',
      message: `${planned} automatische Pläne wurden für die ausgewählte Woche geprüft und übernommen. Die zugewiesenen Mitarbeiter erhalten ihre Einsatzbenachrichtigungen.`,
    };
  } catch {
    return failure('Die automatische Wochenplanung konnte nicht erstellt werden.');
  }
}
