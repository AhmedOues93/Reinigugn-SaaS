'use server';

import { revalidatePath } from 'next/cache';
import { serviceScheduleSchema } from '@reinigung/validation';
import { type FormState } from '@/lib/actions';
import { planningSummary, toPlanningVisits, type PlanningState } from '@/lib/planning';
import { requireStaffCompany } from '@/lib/auth';

const weekdays = [1, 2, 3, 4, 5, 6, 7];
function failure(message: string): FormState { return { status: 'error', message }; }
function scheduleInput(formData: FormData) {
  const rules = weekdays.flatMap((weekday) => formData.get(`weekday_${weekday}_enabled`) === 'true' ? [{ id: String(formData.get(`weekday_${weekday}_id`) ?? ''), weekday, planned_start_time: String(formData.get(`weekday_${weekday}_start`) ?? ''), planned_end_time: String(formData.get(`weekday_${weekday}_end`) ?? '') }] : []);
  return { ...Object.fromEntries(formData), member_ids: formData.getAll('member_ids').filter(Boolean), rules };
}
function horizon() { return new Date(Date.now() + 56 * 86_400_000).toISOString().slice(0, 10); }

/**
 * Einen wiederkehrenden Plan speichern -- in einer einzigen Transaktion.
 *
 * Das war vorher eine Folge einzelner Schreibvorgaenge, die mittendrin
 * stehenbleiben konnte: Regeln deaktiviert, Team geloescht, und dann ein
 * Fehler. Uebrig blieb ein aktiver Plan ohne Wochentag und ohne Team, waehrend
 * die Oberflaeche einen Fehler meldete. save_service_schedule() macht alles
 * oder nichts; die Bedingungen eines angenommenen Angebots setzt es selbst
 * durch, damit sie sich nicht ueber das Formular aushebeln lassen.
 */
async function saveSchedule(scheduleId: string | null, formData: FormData): Promise<FormState> {
  const parsed = serviceScheduleSchema.safeParse(scheduleInput(formData));
  const activateAfterSave = String(formData.get('activate_after_save') ?? '') === 'true';
  const assignmentMode = String(formData.get('assignment_mode') ?? 'AUTO') === 'MANUAL' ? 'MANUAL' : 'AUTO';
  if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? 'Bitte prüfe deine Eingaben.');

  try {
    const { supabase } = await requireStaffCompany();

    const { data, error } = await supabase.rpc('save_service_schedule', {
      p_schedule_id: scheduleId,
      p_customer_id: parsed.data.customer_id,
      p_cleaning_object_id: parsed.data.cleaning_object_id,
      p_checklist_template_id: parsed.data.checklist_template_id ?? null,
      p_name: parsed.data.name,
      p_description: parsed.data.description ?? '',
      p_valid_from: parsed.data.valid_from,
      p_valid_until: parsed.data.valid_until ?? null,
      p_acceptance_policy: parsed.data.acceptance_policy,
      p_billing_mode: parsed.data.billing_mode,
      p_assignment_mode: assignmentMode,
      p_is_active: activateAfterSave,
      p_member_ids: assignmentMode === 'MANUAL' ? parsed.data.member_ids : [],
      p_rules: parsed.data.rules.map((rule) => {
        const suppliedId = (rule as typeof rule & { id?: string }).id;
        return {
          id: suppliedId && /^[0-9a-f-]{36}$/i.test(suppliedId) ? suppliedId : null,
          weekday: rule.weekday,
          planned_start_time: rule.planned_start_time,
          planned_end_time: rule.planned_end_time,
        };
      }),
      p_generate_until: activateAfterSave ? horizon() : null,
    });

    if (error) {
      // Die Datenbank benennt den Grund -- fehlende Wochenstunden, ein Objekt,
      // das nicht zum Kunden gehoert. Nichts davon wurde gespeichert.
      return failure(error.message || 'Der wiederkehrende Plan konnte nicht gespeichert werden.');
    }

    const saved = (Array.isArray(data) ? data[0] : data) as
      | { schedule_id: string; assigned_member: string | null }
      | null;
    const id = saved?.schedule_id;
    if (!id) return failure('Der wiederkehrende Plan konnte nicht gespeichert werden.');

    revalidatePath('/dashboard');
    revalidatePath('/dashboard/planung');
    revalidatePath('/dashboard/auftraege');
    revalidatePath(`/dashboard/planung/plaene/${id}`);

    return {
      status: 'success',
      id,
      message: activateAfterSave
        ? assignmentMode === 'AUTO'
          ? 'Plan aktiviert. ReinPlan hat die Stammbesetzung nach freien Wochenstunden gewählt.'
          : 'Plan aktiviert. Einsätze und Teamzuweisungen wurden aktualisiert.'
        : 'Plan wurde gespeichert.',
    };
  } catch {
    return failure('Der wiederkehrende Plan konnte nicht gespeichert werden.');
  }
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
 * Plan a date window and report the outcome per visit.
 *
 * The database planner is the safety authority: it checks weekly capacity,
 * employment dates, approved vacation/sickness and overlapping work before
 * selecting anyone, and it reports the blocking rule per candidate. Only AUTO
 * schedules are changed, and job generation is idempotent, so existing visits
 * are never removed or duplicated.
 */
export async function createAutomaticPlan(
  _: PlanningState,
  formData: FormData,
): Promise<PlanningState> {
  const from = String(formData.get('from') ?? '');
  const to = String(formData.get('to') ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) {
    return { status: 'error', message: 'Der ausgewählte Zeitraum ist ungültig.' };
  }

  // Server-side bound: a handcrafted request must not schedule years of work.
  const fromMs = Date.parse(`${from}T00:00:00Z`);
  const toMs = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)
    || new Date(fromMs).toISOString().slice(0, 10) !== from
    || new Date(toMs).toISOString().slice(0, 10) !== to
    || (toMs - fromMs) / 86_400_000 > 56) {
    return { status: 'error', message: 'Bitte einen gültigen Zeitraum von höchstens 57 Tagen wählen.' };
  }

  try {
    const { supabase } = await requireStaffCompany();
    const { data, error } = await supabase.rpc('plan_window_automatically', {
      p_from: from,
      p_to: to,
    });

    if (error) {
      return {
        status: 'error',
        message: `Die automatische Planung ist fehlgeschlagen: ${error.message}`,
      };
    }

    const visits = toPlanningVisits(data as Parameters<typeof toPlanningVisits>[0]);

    revalidatePath('/dashboard');
    revalidatePath('/dashboard/planung');
    revalidatePath('/dashboard/auftraege');

    return {
      status: visits.some((visit) => !visit.assigned) ? 'error' : 'success',
      message: planningSummary(visits),
      from,
      to,
      visits,
    };
  } catch {
    return { status: 'error', message: 'Die automatische Planung konnte nicht ausgeführt werden.' };
  }
}
