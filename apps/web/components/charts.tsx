import { cn } from '@reinigung/ui';

/**
 * The product's two charts, drawn as plain SVG.
 *
 * No charting library: both shapes are a handful of rectangles and arcs, and a
 * dependency would ship ~40 kB of JavaScript to the browser for something the
 * server can render once. It also keeps these as server components, so the
 * numbers arrive already computed and there is no loading flash.
 *
 * Every mark carries a `<title>`, which is the browser's own tooltip — hover
 * works with no client JavaScript at all — and every chart is followed by the
 * same figures as text for screen readers, so colour is never the only way to
 * read one.
 */

/* ------------------------------------------------------------------------- */
/* Umsatzentwicklung                                                          */
/* ------------------------------------------------------------------------- */

export type RevenuePoint = { label: string; fullLabel: string; cents: number };

/**
 * One series, so one colour and no legend — the heading already says what the
 * bars are. Bars are anchored to the baseline with rounded tops only; a bar
 * rounded at both ends detaches from its axis and misreads its own value.
 */
export function RevenueBars({
  data,
  formatValue,
  emptyLabel,
  className,
}: {
  data: RevenuePoint[];
  formatValue: (cents: number) => string;
  emptyLabel: string;
  className?: string;
}) {
  const max = Math.max(...data.map((point) => point.cents), 0);
  if (data.length === 0 || max === 0) {
    return (
      <p className={cn('py-10 text-center text-sm text-muted-foreground', className)}>{emptyLabel}</p>
    );
  }

  // A rounded ceiling keeps the gridline labels readable (12.000 €, not 11.847 €).
  const step = niceStep(max / 4);
  const ceiling = step * 4;
  const rows = [4, 3, 2, 1, 0].map((index) => index * step);

  return (
    <figure className={cn('min-w-0', className)}>
      <div className="flex gap-3">
        {/* Value axis. Text, not SVG, so it scales with the user's font size. */}
        <ul className="flex shrink-0 flex-col justify-between py-0.5 text-[11px] tabular-nums text-muted-foreground">
          {rows.map((value) => (
            <li key={value} className="leading-none">
              {formatValue(value)}
            </li>
          ))}
        </ul>

        <div className="relative min-w-0 flex-1">
          {/* Gridlines sit behind the bars and stay recessive. */}
          <div aria-hidden="true" className="absolute inset-0 flex flex-col justify-between">
            {rows.map((value) => (
              <span key={value} className="block h-px w-full bg-border/70" />
            ))}
          </div>

          <ol className="relative flex h-[168px] items-end gap-[3px] sm:gap-1.5">
            {data.map((point) => {
              const height = (point.cents / ceiling) * 100;
              return (
                <li key={point.fullLabel} className="flex h-full min-w-0 flex-1 items-end">
                  <div
                    className="w-full rounded-t-[4px] bg-primary/85 transition-colors hover:bg-primary"
                    style={{ height: `${Math.max(height, point.cents > 0 ? 1.5 : 0)}%` }}
                  >
                    <span className="sr-only">
                      {point.fullLabel}: {formatValue(point.cents)}
                    </span>
                    <span
                      title={`${point.fullLabel}: ${formatValue(point.cents)}`}
                      className="block h-full w-full"
                      aria-hidden="true"
                    />
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      <ol aria-hidden="true" className="mt-2 flex gap-[3px] ps-[3.5rem] text-[11px] text-muted-foreground sm:gap-1.5">
        {data.map((point) => (
          <li key={point.fullLabel} className="min-w-0 flex-1 truncate text-center">
            {point.label}
          </li>
        ))}
      </ol>
    </figure>
  );
}

/** 1 / 2 / 5 × 10ⁿ — the only step sizes that read cleanly on an axis. */
function niceStep(rough: number) {
  if (rough <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalised = rough / magnitude;
  const factor = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10;
  return factor * magnitude;
}

/* ------------------------------------------------------------------------- */
/* Auftragsstatus                                                             */
/* ------------------------------------------------------------------------- */

export type DonutSlice = { label: string; value: number };

/**
 * The lifecycle ramp: light for work not started, dark for work finished.
 *
 * A sequential ramp rather than four unrelated hues, because these states are
 * ordered — a reader should be able to see progress without consulting the
 * legend. One hue means adjacent steps separate by lightness alone, which is
 * weaker than four distinct hues would be, so the legend always carries the
 * label *and* the count: nothing here is identified by colour on its own.
 */
const donutRamp = ['#86E3C0', '#3FC79B', '#12A177', '#0A7154'];

export function StatusDonut({
  slices,
  total,
  totalLabel,
  emptyLabel,
  className,
}: {
  slices: DonutSlice[];
  total: number;
  totalLabel: string;
  emptyLabel: string;
  className?: string;
}) {
  if (total === 0) {
    return <p className={cn('py-10 text-center text-sm text-muted-foreground', className)}>{emptyLabel}</p>;
  }

  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  // A 2px gap of surface between segments, so two adjacent arcs never blend
  // into one longer arc. Suppressed when a slice is too thin to survive it.
  const gap = 2;
  let offset = 0;

  return (
    <div className={cn('flex flex-wrap items-center gap-x-8 gap-y-5', className)}>
      <div className="relative shrink-0">
        <svg viewBox="0 0 140 140" className="size-[132px] -rotate-90" role="img" aria-label={`${totalLabel}: ${total}`}>
          <circle cx="70" cy="70" r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="16" />
          {slices.map((slice, index) => {
            if (slice.value === 0) return null;
            const length = (slice.value / total) * circumference;
            const visible = Math.max(length - gap, 1);
            const dash = `${visible} ${circumference - visible}`;
            const element = (
              <circle
                key={slice.label}
                cx="70"
                cy="70"
                r={radius}
                fill="none"
                stroke={donutRamp[index % donutRamp.length]}
                strokeWidth="16"
                strokeDasharray={dash}
                strokeDashoffset={-offset}
              >
                <title>{`${slice.label}: ${slice.value}`}</title>
              </circle>
            );
            offset += length;
            return element;
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
          <p className="text-2xl font-semibold leading-none tabular-nums">{total}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">{totalLabel}</p>
        </div>
      </div>

      <dl className="min-w-0 flex-1 space-y-2.5">
        {slices.map((slice, index) => (
          <div key={slice.label} className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: donutRamp[index % donutRamp.length] }}
            />
            <dt className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{slice.label}</dt>
            <dd className="text-sm font-semibold tabular-nums">{slice.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
