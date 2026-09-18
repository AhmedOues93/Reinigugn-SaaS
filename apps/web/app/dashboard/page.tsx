import { redirect } from 'next/navigation';
import { landingPathForRole } from '@/lib/landing';
import { Card } from '@/components/ui';
import { getCurrentCompany } from '@/lib/auth';
import { getDashboardMetrics } from '@/lib/data/jobs';
import { t } from '@/lib/i18n';
import { currentLocale } from '@/lib/i18n-server';

export default async function DashboardPage() {
  const { membership, profile } = await getCurrentCompany();
  if (membership && membership.role !== 'OWNER' && membership.role !== 'OFFICE') redirect(landingPathForRole(membership.role));
  const [dashboardMetrics, locale] = await Promise.all([getDashboardMetrics(), currentLocale()]);
  const metrics = [
    { label: t(locale, 'dashboard.todayJobs'), value: String(dashboardMetrics.todayJobs), note: `${dashboardMetrics.plannedToday} ${t(locale, 'status.OPEN').toLocaleLowerCase()}` },
    { label: t(locale, 'dashboard.activeEmployees'), value: String(dashboardMetrics.activeWorkers), note: String(dashboardMetrics.employeesScheduled) },
    { label: t(locale, 'dashboard.weekJobs'), value: String(dashboardMetrics.weekJobs), note: '' },
    { label: t(locale, 'dashboard.timeToday'), value: `${Math.floor(dashboardMetrics.workedMinutes / 60)} h ${dashboardMetrics.workedMinutes % 60} min`, note: '' },
    { label: t(locale, 'dashboard.openComplaints'), value: String(dashboardMetrics.openComplaints), note: dashboardMetrics.overdueComplaints ? String(dashboardMetrics.overdueComplaints) : '' },
    { label: t(locale, 'dashboard.qualityIssues'), value: String(dashboardMetrics.recentQualityIssues), note: '' },
    { label: t(locale, 'dashboard.vacationToday'), value: String(dashboardMetrics.vacationToday), note: '' },
    { label: t(locale, 'dashboard.sickToday'), value: String(dashboardMetrics.sickToday), note: '' },
    { label: t(locale, 'dashboard.affectedAbsenceJobs'), value: String(dashboardMetrics.affectedAbsenceJobs), note: '' },
    { label: t(locale, 'dashboard.openVacationRequests'), value: String(dashboardMetrics.openVacationRequests), note: '' },
  ];
  const company = membership?.companies as unknown as { name: string } | null;
  const firstName = profile?.first_name || 'willkommen';
  return <div className="mx-auto max-w-6xl">
    <div className="mb-8"><p className="text-sm font-medium text-primary">{company?.name}</p><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{t(locale, 'dashboard.welcome', { name: firstName })}</h1><p className="mt-2 text-slate-600">{t(locale, 'dashboard.subtitle')}</p></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{metrics.map((metric) => <Card key={metric.label} className="p-5"><p className="text-sm font-medium text-slate-600">{metric.label}</p><p className="mt-4 text-3xl font-semibold tracking-tight">{metric.value}</p><p className="mt-2 text-xs text-slate-500">{metric.note}</p></Card>)}</div>
    <Card className="mt-6 p-6"><h2 className="font-semibold">{t(locale, 'dashboard.planning')}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{locale === 'de' ? 'Erstellen Sie Einzelaufträge oder wiederkehrende Pläne. Einsatzkonflikte werden vor dem Speichern angezeigt, damit die Disposition bewusst entscheiden kann.' : locale === 'en' ? 'Create one-off jobs or recurring plans. Assignment conflicts are shown before saving so dispatch can make an informed decision.' : 'أنشئ مهام فردية أو خططاً متكررة. تُعرض تعارضات التعيين قبل الحفظ لتمكين فريق التخطيط من اتخاذ قرار مدروس.'}</p></Card>
  </div>;
}
