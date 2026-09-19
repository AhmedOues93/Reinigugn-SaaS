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
  if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? 'Bitte prüfe deine Eingaben.');
  try {
    const { supabase, company } = await requireStaffCompany();
    let id = scheduleId;
    if (!id) {
      const { data, error } = await supabase.from('service_schedules').insert({ company_id: company.id, customer_id: parsed.data.customer_id, cleaning_object_id: parsed.data.cleaning_object_id, checklist_template_id: parsed.data.checklist_template_id ?? null, name: parsed.data.name, description: parsed.data.description ?? '', valid_from: parsed.data.valid_from, valid_until: parsed.data.valid_until ?? null }).select('id').single();
      if (error || !data) return failure('Der wiederkehrende Plan konnte nicht erstellt werden.');
      id = data.id;
    } else {
      const { error } = await supabase.from('service_schedules').update({ customer_id: parsed.data.customer_id, cleaning_object_id: parsed.data.cleaning_object_id, checklist_template_id: parsed.data.checklist_template_id ?? null, name: parsed.data.name, description: parsed.data.description ?? '', valid_from: parsed.data.valid_from, valid_until: parsed.data.valid_until ?? null }).eq('id', id).eq('company_id', company.id);
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
    if (parsed.data.member_ids.length) await supabase.from('service_schedule_assignments').insert(parsed.data.member_ids.map((memberId) => ({ company_id: company.id, service_schedule_id: id, member_id: memberId })));
    const { error: generationError } = await supabase.rpc('generate_jobs_for_schedule', { p_schedule_id: id, p_until: horizon() });
    if (generationError) return failure('Der Plan wurde gespeichert, aber die Aufträge konnten nicht erzeugt werden.');
    revalidatePath('/dashboard'); revalidatePath('/dashboard/planung'); revalidatePath('/dashboard/auftraege');
    return { status: 'success', id };
  } catch { return failure('Der wiederkehrende Plan konnte nicht gespeichert werden.'); }
}

export async function createServiceSchedule(_: FormState, formData: FormData) { return saveSchedule(null, formData); }
export async function updateServiceSchedule(id: string, _: FormState, formData: FormData) { return saveSchedule(id, formData); }
export async function setScheduleActive(id: string, isActive: boolean) {
  try { const { supabase, company } = await requireStaffCompany(); const { error } = await supabase.from('service_schedules').update({ is_active: isActive }).eq('id', id).eq('company_id', company.id); if (error) return { error: 'Der Planstatus konnte nicht aktualisiert werden.' }; if (isActive) await supabase.rpc('generate_jobs_for_schedule', { p_schedule_id: id, p_until: horizon() }); revalidatePath('/dashboard/planung'); revalidatePath('/dashboard/auftraege'); return { error: null }; } catch { return { error: 'Der Planstatus konnte nicht aktualisiert werden.' }; }
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
