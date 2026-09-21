import { listTimeEntries } from '@/lib/data/time-entries';

function first<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function csvCell(value: unknown) {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const from = url.searchParams.get('from') || undefined;
  const to = url.searchParams.get('to') || undefined;
  const memberId = url.searchParams.get('employee') || undefined;
  const customerId = url.searchParams.get('customer') || undefined;
  const objectId = url.searchParams.get('object') || undefined;

  const entries = await listTimeEntries({ from, to, memberId, customerId, objectId });
  const rows = [
    ['Mitarbeiter', 'Kunde', 'Objekt', 'Einsatz', 'Start', 'Ende', 'Pause Minuten', 'Netto Minuten', 'Quelle', 'Korrigiert'],
    ...entries.map((entry) => {
      const member = first(entry.company_members);
      const profile = first(member?.profiles);
      const job = first(entry.jobs);
      const net = entry.duration_minutes == null ? '' : Math.max(0, entry.duration_minutes - (entry.break_minutes ?? 0));
      return [
        [profile?.first_name, profile?.last_name].filter(Boolean).join(' '),
        first(job?.customers)?.name ?? '',
        first(job?.cleaning_objects)?.name ?? '',
        job?.title ?? '',
        entry.started_at,
        entry.finished_at ?? '',
        entry.break_minutes ?? 0,
        net,
        entry.start_source === 'MANUAL' ? 'Manuell' : 'Mitarbeiter-App',
        (entry.time_entry_audit_logs?.[0]?.count ?? 0) > 0 ? 'Ja' : 'Nein',
      ];
    }),
  ];

  const csv = '\uFEFF' + rows.map((row) => row.map(csvCell).join(';')).join('\r\n');
  const fileFrom = from ?? 'start';
  const fileTo = to ?? 'ende';

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="arbeitszeiten-${fileFrom}-${fileTo}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
