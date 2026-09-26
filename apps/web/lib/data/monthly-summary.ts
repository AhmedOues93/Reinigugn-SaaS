import { requireStaffCompany } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

/**
 * Monatsabschluss: hours per employee for one month, and the daily record
 * behind them.
 *
 * This is payroll *preparation*, never payroll. No wage, tax or contribution is
 * computed anywhere in this file or in the functions it calls — those belong to
 * the Lohnbüro. What the office gets is the figure that office is always asked
 * for: how long each person worked, and how that compares to what was agreed.
 */

export type MonthlySummaryRow = {
  member_id: string;
  employee_name: string;
  employee_number: string | null;
  wage_group: string | null;
  weekly_hours: number | null;
  worked_minutes: number;
  break_minutes: number;
  days_worked: number;
  vacation_days: number;
  sick_days: number;
  /** Null when no weekly hours are on file — then there is no Soll and no overtime. */
  target_minutes: number | null;
};

export type MonthlyWorkDay = {
  member_id: string;
  employee_name: string;
  employee_number: string | null;
  work_date: string;
  first_start: string;
  last_end: string;
  worked_minutes: number;
  break_minutes: number;
};

/** The first day of the month a date key falls in, as a date key. */
export function monthKey(value?: string | null): string {
  const now = new Date();
  const fallback = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const month = /^\d{4}-\d{2}$/.test(value ?? '') ? (value as string) : fallback;
  return `${month}-01`;
}

/** The month before the one given, so "letzter Monat" needs no date maths in a page. */
export function previousMonth(month: string): string {
  const [year, index] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year!, (index ?? 1) - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function nextMonth(month: string): string {
  const [year, index] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year!, index ?? 1, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function listMonthlySummary(month: string): Promise<MonthlySummaryRow[]> {
  const { supabase } = await requireStaffCompany();
  const { data, error } = await supabase.rpc('list_monthly_work_summary', { p_month: monthKey(month) });
  if (error) throw new Error('Der Monatsabschluss konnte nicht geladen werden.');
  return (data ?? []) as MonthlySummaryRow[];
}

export async function listMonthlyWorkDays(month: string, memberId?: string): Promise<MonthlyWorkDay[]> {
  const { supabase } = await requireStaffCompany();
  const { data, error } = await supabase.rpc('list_monthly_work_days', {
    p_month: monthKey(month),
    p_member: memberId ?? null,
  });
  if (error) throw new Error('Der Tagesnachweis konnte nicht geladen werden.');
  return (data ?? []) as MonthlyWorkDay[];
}

export type OwnMonth = Omit<MonthlySummaryRow, 'member_id' | 'employee_name' | 'employee_number' | 'weekly_hours'>;

/** The signed-in employee's own month. Nobody else's row is reachable from here. */
export async function getMyMonth(month: string): Promise<OwnMonth | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('my_monthly_work_summary', { p_month: monthKey(month) });
  if (error) return null;
  const row = (Array.isArray(data) ? data[0] : data) as OwnMonth | undefined;
  return row ?? null;
}

/** "38:30" — the form a Stundenzettel uses, not "38,5 h". */
export function hoursAndMinutes(minutes: number | null | undefined): string {
  if (minutes == null) return '—';
  const sign = minutes < 0 ? '−' : '';
  const total = Math.abs(Math.round(minutes));
  return `${sign}${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * The difference between what was worked and what was agreed, or null when
 * there is no agreed week to compare against.
 */
export function overtimeMinutes(row: { worked_minutes: number; target_minutes: number | null }): number | null {
  return row.target_minutes == null ? null : row.worked_minutes - row.target_minutes;
}
