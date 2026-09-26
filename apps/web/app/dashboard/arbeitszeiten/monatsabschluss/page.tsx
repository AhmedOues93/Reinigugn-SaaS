import { Download, FileSpreadsheet } from 'lucide-react';
import { BackLink, ButtonLink, EmptyState, PageHeader, StatBand } from '@/components/ui';
import { DataTable } from '@/components/data-table';
import { MonthPicker } from '@/components/month-picker';
import {
  hoursAndMinutes,
  listMonthlySummary,
  monthKey,
  overtimeMinutes,
  type MonthlySummaryRow,
} from '@/lib/data/monthly-summary';

const monthLabel = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export default async function MonthlySummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ monat?: string }>;
}) {
  const query = await searchParams;
  const key = monthKey(query.monat);
  const month = key.slice(0, 7);
  const rows = await listMonthlySummary(month);

  const worked = rows.reduce((sum, row) => sum + row.worked_minutes, 0);
  const target = rows.reduce((sum, row) => sum + (row.target_minutes ?? 0), 0);
  const withTarget = rows.filter((row) => row.target_minutes != null);
  const balance = withTarget.reduce((sum, row) => sum + (overtimeMinutes(row) ?? 0), 0);
  const missingTarget = rows.length - withTarget.length;

  return (
    <>
      <BackLink href="/dashboard/arbeitszeiten">Arbeitszeiten</BackLink>
      <PageHeader
        title="Monatsabschluss"
        description="Gearbeitete Stunden je Mitarbeiter, Soll aus den vereinbarten Wochenstunden, und die Differenz. Grundlage für die Lohnabrechnung – keine Lohnabrechnung."
        actions={
          <ButtonLink href={`/dashboard/arbeitszeiten/monatsabschluss/export?monat=${month}`} variant="outline">
            <Download className="size-4 shrink-0" aria-hidden="true" />
            CSV für Excel exportieren
          </ButtonLink>
        }
      />

      <MonthPicker month={month} basePath="/dashboard/arbeitszeiten/monatsabschluss" />

      <StatBand
        className="mb-5"
        items={[
          { label: 'Iststunden', value: hoursAndMinutes(worked) },
          { label: 'Sollstunden', value: hoursAndMinutes(target) },
          {
            label: balance < 0 ? 'Minusstunden' : 'Überstunden',
            value: hoursAndMinutes(Math.abs(balance)),
            tone: balance < 0 ? 'warning' : balance > 0 ? 'success' : undefined,
          },
          { label: 'Mitarbeitende', value: String(rows.length) },
        ]}
      />

      {/*
        Neutral, not a warning: nobody is blocked, the office simply cannot be
        shown a Soll for those people until their week is on file.
      */}
      {missingTarget > 0 && (
        <p className="mb-5 rounded-xl border border-border bg-subtle px-4 py-3 text-sm leading-6 text-muted-foreground">
          Für {missingTarget} {missingTarget === 1 ? 'Mitarbeiter sind' : 'Mitarbeitende sind'} keine Wochenstunden
          hinterlegt. Die Iststunden stimmen, ein Soll und damit Über- oder Minusstunden lassen sich ohne vereinbarte
          Wochenstunden nicht berechnen.
        </p>
      )}

      <DataTable<MonthlySummaryRow>
        caption={`Monatsabschluss ${monthLabel.format(new Date(`${key}T12:00:00Z`))}`}
        rows={rows}
        rowKey={(row) => row.member_id}
        columns={[
          { key: 'name', header: 'Mitarbeiter', mobile: 'title', cell: (row) => row.employee_name || '—' },
          {
            key: 'number',
            header: 'Personalnr.',
            hideBelow: 'lg',
            cell: (row) => row.employee_number ?? '—',
          },
          {
            key: 'wage_group',
            header: 'Lohngruppe',
            hideBelow: 'lg',
            cell: (row) => row.wage_group ?? '—',
          },
          {
            key: 'worked',
            header: 'Ist',
            align: 'end',
            cell: (row) => <span className="tabular-nums">{hoursAndMinutes(row.worked_minutes)}</span>,
          },
          {
            key: 'target',
            header: 'Soll',
            align: 'end',
            cell: (row) => <span className="tabular-nums">{hoursAndMinutes(row.target_minutes)}</span>,
          },
          {
            key: 'balance',
            header: 'Differenz',
            align: 'end',
            mobile: 'status',
            cell: (row) => {
              const diff = overtimeMinutes(row);
              if (diff == null) return <span className="text-muted-foreground">—</span>;
              const tone = diff < 0 ? 'text-warning' : diff > 0 ? 'text-success' : 'text-muted-foreground';
              return (
                <span className={`tabular-nums font-medium ${tone}`}>
                  {diff > 0 ? '+' : ''}
                  {hoursAndMinutes(diff)}
                </span>
              );
            },
          },
          { key: 'days', header: 'Tage', align: 'end', cell: (row) => String(row.days_worked) },
          { key: 'vacation', header: 'Urlaub', align: 'end', cell: (row) => String(row.vacation_days) },
          { key: 'sick', header: 'Krank', align: 'end', cell: (row) => String(row.sick_days) },
        ]}
        empty={
          <EmptyState
            icon={<FileSpreadsheet />}
            title="Keine Mitarbeitenden"
            body="Sobald Mitarbeitende angelegt sind, erscheint hier ihr Monat."
          />
        }
      />

      <p className="mt-5 text-sm leading-6 text-muted-foreground">
        Das Soll rechnet mit den Wochentagen des Monats abzüglich der neun bundesweiten Feiertage und der genehmigten
        Abwesenheiten. Feiertage einzelner Bundesländer sind nicht berücksichtigt und müssen gegebenenfalls manuell
        abgezogen werden.
      </p>
    </>
  );
}
