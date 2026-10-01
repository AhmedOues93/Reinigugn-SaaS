import { requireStaffCompany } from '@/lib/auth';
import { type CapacitySnapshot } from '@/lib/capacity';

type Row = {
  as_of: string;
  employees: number;
  employees_with_target: number;
  target_minutes_to_date: number | null;
  target_minutes_month: number | null;
  worked_minutes: number;
  planned_minutes: number;
  unassigned_planned_minutes: number;
};

/**
 * Soll, Ist und Plan fuer einen Monat, in der Datenbank gerechnet.
 *
 * Die Zahlen muessen zum Monatsabschluss passen, und der rechnet dort. Sie
 * hier noch einmal aus Einzelzeilen zusammenzusetzen waere eine zweite
 * Wahrheit, die irgendwann abweicht.
 */
export async function getCapacitySnapshot(month?: string): Promise<CapacitySnapshot | null> {
  const { supabase } = await requireStaffCompany();
  const { data, error } = await supabase.rpc('company_capacity_snapshot', month ? { p_month: month } : {});
  if (error) {
    console.error('Auslastung konnte nicht geladen werden:', error.message);
    return null;
  }
  const row = ((data ?? []) as Row[])[0];
  if (!row) return null;

  return {
    asOf: row.as_of,
    employees: row.employees ?? 0,
    employeesWithTarget: row.employees_with_target ?? 0,
    targetMinutesToDate: row.target_minutes_to_date === null ? null : Number(row.target_minutes_to_date),
    targetMinutesMonth: row.target_minutes_month === null ? null : Number(row.target_minutes_month),
    workedMinutes: Number(row.worked_minutes ?? 0),
    plannedMinutes: Number(row.planned_minutes ?? 0),
    unassignedPlannedMinutes: Number(row.unassigned_planned_minutes ?? 0),
  };
}
