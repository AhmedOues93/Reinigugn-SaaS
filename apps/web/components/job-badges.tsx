export function JobStatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = { PLANNED: 'Geplant', CONFIRMED: 'Bestaetigt', CANCELLED: 'Storniert', IN_PROGRESS: 'In Arbeit', COMPLETED: 'Abgeschlossen', MISSED: 'Verpasst' };
  const classes: Record<string, string> = { PLANNED: 'bg-slate-100 text-slate-700', CONFIRMED: 'bg-blue-50 text-blue-700', CANCELLED: 'bg-red-50 text-red-700', IN_PROGRESS: 'bg-amber-50 text-amber-800', COMPLETED: 'bg-teal-50 text-teal-800', MISSED: 'bg-red-50 text-red-700' };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${classes[status] ?? classes.PLANNED}`}>{labels[status] ?? status}</span>;
}

export function formatJobTime(start: string, end?: string) {
  const formatter = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
  return end ? `${formatter.format(new Date(start))}–${formatter.format(new Date(end))}` : formatter.format(new Date(start));
}
