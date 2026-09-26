import {
  hoursAndMinutes,
  listMonthlySummary,
  listMonthlyWorkDays,
  monthKey,
  overtimeMinutes,
} from '@/lib/data/monthly-summary';

/**
 * The month as one CSV, for the Lohnbüro or the Steuerberater.
 *
 * Two blocks in one file: the per-employee totals the payroll run needs, and
 * the daily record §17 MiLoG requires this industry to keep — start, end and
 * duration per person per day. Both in one download, because in practice they
 * are asked for together and a second file is a second thing to forget.
 *
 * Semicolons and a BOM, like the existing time export: that is what a German
 * Excel opens without an import dialogue. Hours are written as 38:30 rather
 * than 38,5 so nothing is lost to rounding on the way, and the raw minutes ride
 * along beside them for anything that would rather compute than read.
 */
function csvCell(value: unknown) {
  let text = value == null ? '' : String(value);
  // A leading =, +, - or @ makes a spreadsheet treat the text as a formula.
  if (/^[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

const dateOnly = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' });
const timeOnly = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });

export async function GET(request: Request) {
  const month = monthKey(new URL(request.url).searchParams.get('monat')).slice(0, 7);
  const [summary, days] = await Promise.all([listMonthlySummary(month), listMonthlyWorkDays(month)]);

  const rows: unknown[][] = [
    ['Monatsabschluss', month],
    [],
    ['Mitarbeiter', 'Personalnr.', 'Lohngruppe', 'Wochenstunden', 'Iststunden', 'Istminuten', 'Sollstunden', 'Sollminuten', 'Differenz', 'Differenz Minuten', 'Arbeitstage', 'Urlaubstage', 'Kranktage'],
    ...summary.map((row) => {
      const diff = overtimeMinutes(row);
      return [
        row.employee_name,
        row.employee_number ?? '',
        row.wage_group ?? '',
        row.weekly_hours ?? '',
        hoursAndMinutes(row.worked_minutes),
        row.worked_minutes,
        row.target_minutes == null ? '' : hoursAndMinutes(row.target_minutes),
        row.target_minutes ?? '',
        diff == null ? '' : `${diff > 0 ? '+' : ''}${hoursAndMinutes(diff)}`,
        diff ?? '',
        row.days_worked,
        row.vacation_days,
        row.sick_days,
      ];
    }),
    [],
    ['Tagesnachweis nach § 17 MiLoG'],
    ['Mitarbeiter', 'Personalnr.', 'Datum', 'Beginn', 'Ende', 'Pause Minuten', 'Arbeitszeit', 'Arbeitsminuten'],
    ...days.map((day) => [
      day.employee_name,
      day.employee_number ?? '',
      dateOnly.format(new Date(day.work_date)),
      timeOnly.format(new Date(day.first_start)),
      timeOnly.format(new Date(day.last_end)),
      day.break_minutes,
      hoursAndMinutes(day.worked_minutes),
      day.worked_minutes,
    ]),
  ];

  const csv = '﻿' + rows.map((row) => row.map(csvCell).join(';')).join('\r\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="monatsabschluss-${month}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
