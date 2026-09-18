import Link from 'next/link';
import { ChevronRight, Clock3, MapPin } from 'lucide-react';
import { cn } from '@reinigung/ui';
import { Badge } from '@/components/ui';
import { formatDate, formatTimeRange } from '@/lib/format';
import { t, type Locale } from '@/lib/i18n';

type JobLike = {
  id: string;
  title: string;
  scheduled_date: string;
  planned_start_at: string | null;
  planned_end_at: string | null;
  status: string;
  customers: { name: string } | { name: string }[] | null;
  cleaning_objects:
    | { name: string; street: string | null; postal_code: string | null; city: string | null }
    | { name: string; street: string | null; postal_code: string | null; city: string | null }[]
    | null;
  job_time_entries?: { started_at: string; finished_at: string | null }[] | null;
  job_checklists?: { job_checklist_items: { completed_at: string | null; is_required: boolean }[] }[] | null;
};

function first<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

/**
 * One visit, as a single large tap target. The time is the most prominent thing
 * on the card because that is what a cleaner scans for; status and checklist
 * progress sit underneath, and the address is one line they can act on.
 */
export function EmployeeJobCard({ job, locale, showDate = false }: { job: JobLike; locale: Locale; showDate?: boolean }) {
  const customer = first(job.customers);
  const object = first(job.cleaning_objects);
  const items = job.job_checklists?.[0]?.job_checklist_items ?? [];
  const done = items.filter((item) => item.completed_at).length;
  const entry = job.job_time_entries?.[0];
  const running = Boolean(entry && !entry.finished_at);
  const complete = job.status === 'COMPLETED';

  return (
    <Link
      href={`/mitarbeiter/einsaetze/${job.id}`}
      className={cn(
        'block rounded-lg border bg-card p-4 shadow-card transition-colors hover:border-primary',
        running ? 'border-primary ring-1 ring-primary/30' : 'border-border',
      )}
    >
      {showDate && <p className="mb-1 text-xs font-medium text-primary">{formatDate(locale, job.scheduled_date, 'long')}</p>}

      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-lg font-semibold tabular-nums">
            <Clock3 className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            {formatTimeRange(locale, job.planned_start_at, job.planned_end_at)}
          </p>
          <p className="mt-1 truncate text-base font-medium">{object?.name || job.title}</p>
          <p className="truncate text-sm text-muted-foreground">{customer?.name}</p>
        </div>
        <ChevronRight className="mt-1 size-5 shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden="true" />
      </div>

      {object?.street && (
        <p className="mt-3 flex items-start gap-1.5 text-sm text-muted-foreground">
          <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">
            {object.street}, {object.postal_code} {object.city}
          </span>
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {running ? (
          <Badge tone="warning">{t(locale, 'emp.job.running')}</Badge>
        ) : complete ? (
          <Badge tone="success">{t(locale, 'emp.job.done')}</Badge>
        ) : (
          <Badge tone="neutral">{t(locale, `status.${job.status}`)}</Badge>
        )}
        {items.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {t(locale, 'emp.job.checklistProgress', { done, total: items.length })}
          </span>
        )}
      </div>
    </Link>
  );
}
