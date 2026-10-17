import Link from 'next/link';
import { cn } from '@reinigung/ui';
import { type CapacitySnapshot, hoursFromMinutes, utilisationPercent, utilisationTone } from '@/lib/capacity';
import { SectionCard } from '@/components/ui';
import { t, type Locale } from '@/lib/i18n';

const barTone = {
  neutral: 'bg-muted-foreground/40',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
} as const;

const textTone = {
  neutral: 'text-muted-foreground',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
} as const;

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className="min-w-0 break-words text-sm text-muted-foreground">{label}</dt>
      <dd className={cn('shrink-0 text-sm font-semibold tabular-nums', tone)}>{value}</dd>
    </div>
  );
}

/**
 * Soll gegen Ist, und was im Plan steht.
 *
 * Das Soll gilt bis heute, nicht fuer den ganzen Monat: beides gegeneinander
 * zu stellen zeigt am Zwoelften jeden Betrieb bei vierzig Prozent, und die
 * Zahl sieht aus wie ein Befund.
 */
export function CapacityCard({
  snapshot,
  locale,
}: {
  snapshot: CapacitySnapshot;
  locale: Locale;
}) {
  const percent = utilisationPercent(snapshot.workedMinutes, snapshot.targetMinutesToDate);
  const tone = utilisationTone(percent);
  const hours = (minutes: number) =>
    `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(hoursFromMinutes(minutes))} h`;

  return (
    <SectionCard title={t(locale, 'dashboard.capacity')}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="text-sm text-muted-foreground">{t(locale, 'dashboard.utilisation')}</span>
          <span className={cn('text-2xl font-semibold tabular-nums', textTone[tone])}>
            {percent === null ? '—' : `${percent} %`}
          </span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-foreground/[0.07]">
          <div
            className={cn('h-full rounded-full transition-[width]', barTone[tone])}
            style={{ width: `${Math.min(100, Math.max(0, percent ?? 0))}%` }}
          />
        </div>

        {percent === null ? (
          <p className="mt-3 text-sm leading-5 text-muted-foreground">
            {t(locale, 'dashboard.noTargetHours')}
          </p>
        ) : null}

        <dl className="mt-3 divide-y divide-border/70">
          <Row
            label={t(locale, 'dashboard.targetToDate')}
            value={snapshot.targetMinutesToDate === null ? '—' : hours(snapshot.targetMinutesToDate)}
          />
          <Row label={t(locale, 'dashboard.actualToDate')} value={hours(snapshot.workedMinutes)} />
          <Row label={t(locale, 'dashboard.plannedThisMonth')} value={hours(snapshot.plannedMinutes)} />
        </dl>

        {snapshot.unassignedPlannedMinutes > 0 ? (
          <Link
            href="/dashboard/planung"
            className="mt-2 inline-flex min-h-touch items-center text-sm font-medium text-warning underline-offset-4 hover:underline md:min-h-9"
          >
            {hours(snapshot.unassignedPlannedMinutes)} {t(locale, 'dashboard.unassignedPlanned')}
          </Link>
        ) : null}
      </div>
    </SectionCard>
  );
}
