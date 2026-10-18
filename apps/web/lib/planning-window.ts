import { addDays } from '@/lib/date';

export type PlanningView = 'rolling' | 'week';

export type PlanningWindowQuery = {
  start?: string;
  /** The older link shape. Kept so bookmarked week links keep working. */
  week?: string;
  view?: string;
};

const dateKey = /^\d{4}-\d{2}-\d{2}$/;

/** Monday of the week a date key falls in, as a date key. Never leaves string maths. */
export function mondayOf(value: string) {
  const day = new Date(`${value}T12:00:00Z`).getUTCDay() || 7;
  return addDays(value, 1 - day);
}

export function isoWeek(value: string) {
  const target = new Date(`${value}T12:00:00Z`);
  target.setUTCDate(target.getUTCDate() + 4 - (target.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

/**
 * Which seven days the planning board shows.
 *
 * Seven days from today is the default, because that is what the office works
 * with: on a Saturday the calendar week is almost over, and snapping to Monday
 * hid exactly the days that still needed staffing. The calendar week stays one
 * click away, because rosters, payroll and customers all talk in KW.
 *
 * `atToday` is what the "Heute" button reflects, and it means something
 * different per view: the window starting today, or the week containing today.
 */
export function planningWindow(query: PlanningWindowQuery, today: string) {
  const view: PlanningView =
    query.view === 'kw' || (query.view === undefined && query.week !== undefined)
      ? 'week'
      : 'rolling';

  const anchor =
    (query.start && dateKey.test(query.start) && query.start) ||
    (query.week && dateKey.test(query.week) && query.week) ||
    today;

  const start = view === 'week' ? mondayOf(anchor) : anchor;
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));

  return {
    view,
    start,
    days,
    end: days[6]!,
    atToday: view === 'week' ? mondayOf(today) === start : start === today,
  };
}
