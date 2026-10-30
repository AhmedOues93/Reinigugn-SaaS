import { cn } from '@reinigung/ui';

const weekdays = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

export type ScheduleRule = {
  weekday: number;
  planned_start_time: string;
  planned_end_time?: string | null;
  is_active?: boolean | null;
};

/**
 * The week a recurring plan runs on, as seven slots rather than a sentence.
 *
 * A cleaning rhythm is read at a glance — "Mo, Mi, Fr early" — not parsed from
 * prose, so the empty days carry as much information as the filled ones.
 */
export function WeekRhythm({ rules, className }: { rules: ScheduleRule[]; className?: string }) {
  const active = new Map(
    rules
      .filter((rule) => rule.is_active !== false)
      .map((rule) => [rule.weekday, rule.planned_start_time.slice(0, 5)]),
  );

  return (
    <ul className={cn('flex gap-1', className)} aria-label="Wochenrhythmus">
      {weekdays.map((day, index) => {
        const time = active.get(index + 1);
        return (
          <li
            key={day}
            className={cn(
              'grid min-w-9 place-items-center rounded-md px-1 py-1 text-[11px] font-medium leading-tight',
              time ? 'bg-primary-soft text-primary' : 'bg-muted text-muted-foreground/60',
            )}
          >
            <span aria-hidden="true">{day}</span>
            <span aria-hidden="true" className="tabular-nums">
              {time ?? '–'}
            </span>
            <span className="sr-only">{time ? `${day}: ${time} Uhr` : `${day}: kein Einsatz`}</span>
          </li>
        );
      })}
    </ul>
  );
}
