import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { nextMonth, previousMonth } from '@/lib/data/monthly-summary';

const label = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/**
 * Month navigation for a closing screen.
 *
 * Links rather than a form: the month is the whole state of the page, so it
 * belongs in the URL where it can be bookmarked and shared with the Lohnbüro.
 * Stepping forward past the current month is pointless, so that arrow is simply
 * not rendered.
 */
export function MonthPicker({ month, basePath }: { month: string; basePath: string }) {
  const now = new Date();
  const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const previous = previousMonth(month);
  const upcoming = nextMonth(month);
  const canGoForward = upcoming <= current;

  return (
    <nav aria-label="Monat wechseln" className="mb-5 flex items-center gap-2">
      <Link
        href={`${basePath}?monat=${previous}`}
        aria-label="Vorheriger Monat"
        className="grid size-touch shrink-0 place-items-center rounded-lg border border-input bg-card text-muted-foreground shadow-card transition-colors hover:border-foreground/25 hover:text-foreground md:size-10"
      >
        <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
      </Link>

      <p className="min-w-0 flex-1 text-center text-[15px] font-semibold sm:flex-none sm:text-start">
        {label.format(new Date(`${month}-01T12:00:00Z`))}
      </p>

      {canGoForward ? (
        <Link
          href={`${basePath}?monat=${upcoming}`}
          aria-label="Nächster Monat"
          className="grid size-touch shrink-0 place-items-center rounded-lg border border-input bg-card text-muted-foreground shadow-card transition-colors hover:border-foreground/25 hover:text-foreground md:size-10"
        >
          <ChevronRight className="size-4 rtl:rotate-180" aria-hidden="true" />
        </Link>
      ) : (
        <span className="size-touch shrink-0 md:size-10" aria-hidden="true" />
      )}

      {month !== current && (
        <Link
          href={basePath}
          className="ms-1 inline-flex min-h-touch items-center rounded-lg px-3 text-sm font-medium text-primary underline-offset-4 hover:underline md:min-h-10"
        >
          Aktueller Monat
        </Link>
      )}
    </nav>
  );
}
