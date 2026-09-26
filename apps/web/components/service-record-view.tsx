/* eslint-disable @next/next/no-img-element -- signed, short-lived storage URLs */
import type { ServiceRecord } from '@/lib/data/service-record';
import { formatDate, formatDateTime, formatTimeRange } from '@/lib/format';

/**
 * The proof of service as a document, not a screen.
 *
 * A Leistungsnachweis is filed and forwarded by the customer, so it shares the
 * sheet idiom of the invoice — A4 measure, ink on white, hairline rules — rather
 * than the workspace's cards. It prints directly, which is also how it is saved
 * as a PDF.
 */
const categoryLabel = {
  BEFORE: 'Vorher',
  AFTER: 'Nachher',
  DOCUMENTATION: 'Dokumentation',
} as const;

const statusLabel: Record<string, string> = {
  PLANNED: 'Geplant',
  CONFIRMED: 'Bestätigt',
  IN_PROGRESS: 'In Arbeit',
  COMPLETED: 'Abgeschlossen',
  CANCELLED: 'Storniert',
  MISSED: 'Nicht erbracht',
};

function duration(minutes: number | null) {
  if (minutes == null) return 'Läuft';
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
}

/** Section heading inside the sheet: a rule and a quiet label carry the break. */
function SheetSection({
  title,
  children,
  aside,
}: {
  title: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <section className="mt-9 break-inside-avoid">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-slate-300 pb-1.5">
        <h2 className="text-[13px] font-semibold text-slate-900">{title}</h2>
        {aside && <p className="text-xs text-slate-500">{aside}</p>}
      </div>
      {children}
    </section>
  );
}

export function ServiceRecordView({ record }: { record: ServiceRecord }) {
  const completed = record.checklistItems.filter((item) => item.completedAt).length;
  const workedMinutes = record.timeEntries.reduce(
    (total, entry) => total + (entry.durationMinutes ?? 0),
    0,
  );
  const objectAddress = [
    record.job.object?.street,
    [record.job.object?.postal_code, record.job.object?.city].filter(Boolean).join(' '),
    record.job.object?.country,
  ]
    .filter(Boolean)
    .join(', ');
  const companyAddress = [
    record.company.street,
    [record.company.postal_code, record.company.city].filter(Boolean).join(' '),
    record.company.country,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <article className="mx-auto w-full max-w-[210mm] bg-white p-5 text-[13px] leading-relaxed text-slate-900 shadow-sm sm:p-12 print:max-w-none print:p-0 print:shadow-none">
      <header className="flex flex-wrap items-start justify-between gap-6 border-b border-slate-800 pb-5">
        <div className="min-w-0">
          <p className="text-xl font-semibold tracking-tight">{record.company.name}</p>
          {companyAddress && <p className="mt-1 text-xs text-slate-500">{companyAddress}</p>}
        </div>
        <div className="text-end">
          <h1 className="text-lg font-semibold tracking-tight">Leistungsnachweis</h1>
          <p className="mt-0.5 text-xs tabular-nums text-slate-500">
            {formatDate('de', record.job.scheduled_date, 'long')}
          </p>
        </div>
      </header>

      <section className="mt-8 flex flex-wrap justify-between gap-8">
        <div className="min-w-0">
          <p className="text-xs text-slate-500">Auftraggeber</p>
          <address className="mt-1.5 not-italic">
            <span className="block font-medium">
              {record.job.customer?.name ?? 'Nicht hinterlegt'}
            </span>
          </address>
          <p className="mt-4 text-xs text-slate-500">Objekt</p>
          <address className="mt-1.5 not-italic">
            <span className="block font-medium">
              {record.job.object?.name ?? 'Nicht hinterlegt'}
            </span>
            {objectAddress && <span className="block text-slate-600">{objectAddress}</span>}
          </address>
        </div>
        <dl className="text-[13px]">
          <div className="flex justify-between gap-10">
            <dt className="text-slate-500">Leistung</dt>
            <dd className="font-medium">{record.job.title}</dd>
          </div>
          <div className="mt-1 flex justify-between gap-10">
            <dt className="text-slate-500">Geplant</dt>
            <dd className="tabular-nums">
              {formatTimeRange('de', record.job.planned_start_at, record.job.planned_end_at)}
            </dd>
          </div>
          <div className="mt-1 flex justify-between gap-10">
            <dt className="text-slate-500">Erfasste Zeit</dt>
            <dd className="font-medium tabular-nums">
              {workedMinutes ? duration(workedMinutes) : '—'}
            </dd>
          </div>
          <div className="mt-1 flex justify-between gap-10">
            <dt className="text-slate-500">Status</dt>
            <dd className="font-medium">{statusLabel[record.job.status] ?? record.job.status}</dd>
          </div>
        </dl>
      </section>

      <SheetSection
        title="Eingesetzte Mitarbeiter"
        aside={
          record.assignments.length > 0
            ? `${record.assignments.length} Person${record.assignments.length === 1 ? '' : 'en'}`
            : undefined
        }
      >
        {record.assignments.length === 0 ? (
          <p className="mt-3 text-slate-500">Keine Mitarbeiter zugewiesen.</p>
        ) : (
          <ul className="mt-3 grid gap-x-8 gap-y-1 sm:grid-cols-2">
            {record.assignments.map((assignment) => (
              <li key={assignment.id}>{assignment.name}</li>
            ))}
          </ul>
        )}
      </SheetSection>

      <SheetSection title="Arbeitszeiten">
        {record.timeEntries.length === 0 ? (
          <p className="mt-3 text-slate-500">Noch keine Arbeitszeit erfasst.</p>
        ) : (
          <table className="mt-2 w-full text-start text-[13px]">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-500">
                <th scope="col" className="py-2 text-start font-medium">
                  Mitarbeiter
                </th>
                <th scope="col" className="py-2 text-start font-medium">
                  Beginn
                </th>
                <th scope="col" className="py-2 text-start font-medium">
                  Ende
                </th>
                <th scope="col" className="py-2 text-end font-medium">
                  Dauer
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {record.timeEntries.map((entry) => (
                <tr key={entry.id}>
                  <td className="py-2 font-medium">{entry.name}</td>
                  <td className="py-2 tabular-nums">{formatDateTime('de', entry.startedAt)}</td>
                  <td className="py-2 tabular-nums">
                    {entry.finishedAt
                      ? formatDateTime('de', entry.finishedAt)
                      : 'Noch nicht beendet'}
                  </td>
                  <td className="py-2 text-end tabular-nums">{duration(entry.durationMinutes)}</td>
                </tr>
              ))}
            </tbody>
            {record.timeEntries.length > 1 && (
              <tfoot>
                <tr className="border-t border-slate-300 font-semibold">
                  <td className="py-2" colSpan={3}>
                    Summe
                  </td>
                  <td className="py-2 text-end tabular-nums">{duration(workedMinutes)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </SheetSection>

      <SheetSection
        title="Checkliste"
        aside={
          record.checklistItems.length > 0
            ? `${completed} von ${record.checklistItems.length} erledigt`
            : undefined
        }
      >
        {record.checklistItems.length === 0 ? (
          <p className="mt-3 text-slate-500">Keine Checkliste für diesen Auftrag hinterlegt.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {record.checklistItems.map((item) => (
              <li key={item.id} className="flex items-start gap-2.5">
                {/* The box itself carries the state — it survives a black-and-white print. */}
                <span
                  aria-hidden="true"
                  className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-[3px] border text-[10px] font-bold leading-none ${
                    item.completedAt
                      ? 'border-slate-800 bg-slate-800 text-white'
                      : 'border-slate-300 text-transparent'
                  }`}
                >
                  ✓
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block">
                    <span className={item.completedAt ? 'font-medium' : 'text-slate-500'}>
                      {item.title}
                    </span>
                    {!item.isRequired && (
                      <span className="ms-2 text-xs text-slate-500">optional</span>
                    )}
                  </span>
                  {item.instruction && (
                    <span className="block text-slate-600">{item.instruction}</span>
                  )}
                  {item.completedAt && (
                    <span className="block text-xs tabular-nums text-slate-500">
                      {item.completedBy ?? 'Mitarbeiter'}, {formatDateTime('de', item.completedAt)}
                    </span>
                  )}
                </span>
                <span className="sr-only">{item.completedAt ? 'Erledigt' : 'Offen'}</span>
              </li>
            ))}
          </ul>
        )}
      </SheetSection>

      <SheetSection
        title="Fotodokumentation"
        aside={
          record.photos.length > 0
            ? `${record.photos.length} Aufnahme${record.photos.length === 1 ? '' : 'n'}`
            : undefined
        }
      >
        {record.photos.length === 0 ? (
          <p className="mt-3 text-slate-500">Keine Fotos dokumentiert.</p>
        ) : (
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {record.photos.map((photo) => (
              <li key={photo.id} className="break-inside-avoid">
                <div className="aspect-[4/3] overflow-hidden rounded border border-slate-200 bg-slate-100">
                  {photo.url ? (
                    <img
                      src={photo.url}
                      alt={
                        photo.description ||
                        `${categoryLabel[photo.category]} – ${record.job.title}`
                      }
                      className="size-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <p className="p-3 text-slate-500">Foto nicht verfügbar.</p>
                  )}
                </div>
                <p className="mt-1.5 font-medium">{categoryLabel[photo.category]}</p>
                {photo.description && <p className="text-slate-600">{photo.description}</p>}
                {photo.checklist_item && (
                  <p className="text-slate-600">Zu: {photo.checklist_item.title}</p>
                )}
                <p className="text-xs tabular-nums text-slate-500">
                  {photo.uploader}, {formatDateTime('de', photo.created_at)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </SheetSection>

      <footer className="mt-10 border-t border-slate-200 pt-4 text-xs text-slate-500">
        <p>
          Dieser Leistungsnachweis wurde aus den erfassten Arbeitszeiten, Checklistenpunkten und
          Fotos des Einsatzes erzeugt.
        </p>
      </footer>
    </article>
  );
}
