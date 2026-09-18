import Link from 'next/link';
import { ChevronRight, MapPin } from 'lucide-react';
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
  cleaning_objects: { name: string; street: string | null; postal_code: string | null; city: string | null } | { name: string; street: string | null; postal_code: string | null; city: string | null }[] | null;
  job_checklists?: { job_checklist_items: { completed_at: string | null; is_required: boolean }[] }[] | null;
};

function first<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

const statusTone: Record<string, string> = {
  PLANNED: 'bg-slate-100 text-slate-700',
  CONFIRMED: 'bg-blue-50 text-blue-700',
  IN_PROGRESS: 'bg-amber-100 text-amber-900',
  COMPLETED: 'bg-primary/10 text-primary',
  MISSED: 'bg-red-50 text-red-700',
};

/**
 * One tappable visit. The whole card is the touch target, the status is legible
 * at a glance, and the checklist progress tells the employee what is left.
 */
export function EmployeeJobCard({ job, locale, showDate = false }: { job: JobLike; locale: Locale; showDate?: boolean }) {
  const customer = first(job.customers);
  const object = first(job.cleaning_objects);
  const items = job.job_checklists?.[0]?.job_checklist_items ?? [];
  const done = items.filter((item) => item.completed_at).length;

  return (
    <Link
      href={`/mitarbeiter/einsaetze/${job.id}`}
      className="block rounded-lg border bg-white p-4 transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {showDate && <p className="text-xs font-medium text-primary">{formatDate(locale, job.scheduled_date, 'long')}</p>}
          <p className="truncate text-base font-semibold text-slate-900">{object?.name || job.title}</p>
          <p className="mt-0.5 truncate text-sm text-slate-600">{customer?.name}</p>
          <p className="mt-1 text-sm font-medium text-slate-800">{formatTimeRange(locale, job.planned_start_at, job.planned_end_at)}</p>
        </div>
        <ChevronRight className="mt-1 size-5 shrink-0 text-slate-400 rtl:rotate-180" aria-hidden="true" />
      </div>
      {object?.street && (
        <p className="mt-3 flex items-start gap-1.5 text-sm text-slate-600">
          <MapPin className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden="true" />
          <span className="truncate">
            {object.street}, {object.postal_code} {object.city}
          </span>
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusTone[job.status] ?? statusTone.PLANNED}`}>
          {t(locale, `status.${job.status}`)}
        </span>
        {items.length > 0 && (
          <span className="text-xs text-slate-500">{t(locale, 'emp.job.checklistProgress', { done, total: items.length })}</span>
        )}
      </div>
    </Link>
  );
}
