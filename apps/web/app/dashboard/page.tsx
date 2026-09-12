import { redirect } from 'next/navigation';
import { Card } from '@/components/ui';
import { getCurrentCompany } from '@/lib/auth';
import { getDashboardMetrics } from '@/lib/data/jobs';

export default async function DashboardPage() {
  const { membership, profile } = await getCurrentCompany();
  if (membership?.role === 'EMPLOYEE') redirect('/dashboard/mein-bereich');
  const dashboardMetrics = await getDashboardMetrics();
  const metrics = [
    { label: 'Auftraege heute', value: String(dashboardMetrics.todayJobs), note: `${dashboardMetrics.plannedToday} offen oder bestaetigt` },
    { label: 'Mitarbeiter eingeplant', value: String(dashboardMetrics.employeesScheduled), note: 'Heute mit einem Einsatz' },
    { label: 'Auftraege diese Woche', value: String(dashboardMetrics.weekJobs), note: 'Heute bis einschliesslich Tag 7' },
    { label: 'Wiederkehrende Planung', value: 'Aktiv', note: 'Plaene erzeugen Einsaetze im Voraus' },
  ];
  const company = membership?.companies as unknown as { name: string } | null;
  const firstName = profile?.first_name || 'willkommen';
  return <div className="mx-auto max-w-6xl">
    <div className="mb-8"><p className="text-sm font-medium text-teal-700">{company?.name}</p><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Willkommen, {firstName}</h1><p className="mt-2 text-slate-600">Hier siehst du den aktuellen Stand deines Betriebs.</p></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map((metric) => <Card key={metric.label} className="p-5"><p className="text-sm font-medium text-slate-600">{metric.label}</p><p className="mt-4 text-3xl font-semibold tracking-tight">{metric.value}</p><p className="mt-2 text-xs text-slate-500">{metric.note}</p></Card>)}</div>
    <Card className="mt-6 p-6"><h2 className="font-semibold">Operative Planung</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Erstellen Sie Einzelauftraege oder wiederkehrende Plaene. Einsatzkonflikte werden vor dem Speichern angezeigt, damit die Disposition bewusst entscheiden kann.</p></Card>
  </div>;
}
