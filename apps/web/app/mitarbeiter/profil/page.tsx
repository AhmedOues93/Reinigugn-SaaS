import { notFound } from 'next/navigation';
import { Card } from '@/components/ui';
import { EmployeePageHeader } from '@/components/employee/employee-shell';
import { EmployeeLanguagePicker } from '@/components/employee/language-picker';
import { logout } from '@/app/(auth)/actions';
import { employeeLocale, getMyEmployeeProfile } from '@/lib/data/employee';
import { formatDate } from '@/lib/format';
import { t } from '@/lib/i18n';
import { setMyAppLanguage } from '../actions';

export default async function EmployeeProfilePage() {
  const [locale, profile] = await Promise.all([employeeLocale(), getMyEmployeeProfile()]);
  if (!profile) notFound();
  const name = [profile.firstName, profile.lastName].filter(Boolean).join(' ');

  return (
    <>
      <EmployeePageHeader title={t(locale, 'emp.profile.title')} />

      <Card className="p-5">
        <p className="text-lg font-semibold">{name || profile.email}</p>
        {profile.email && <p className="mt-1 text-sm text-slate-600">{profile.email}</p>}
        <dl className="mt-5 space-y-4 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">{t(locale, 'emp.profile.employeeNumber')}</dt>
            <dd className="font-medium">{profile.employeeNumber ?? t(locale, 'common.none')}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">{t(locale, 'emp.profile.weeklyHours')}</dt>
            <dd className="font-medium">{profile.weeklyHours ?? t(locale, 'common.none')}</dd>
          </div>
          {profile.employmentStartDate && (
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">{t(locale, 'common.date')}</dt>
              <dd className="font-medium">{formatDate(locale, profile.employmentStartDate)}</dd>
            </div>
          )}
        </dl>
      </Card>

      <Card className="mt-4 p-5">
        <h2 className="font-semibold">{t(locale, 'emp.profile.language')}</h2>
        <EmployeeLanguagePicker locale={locale} action={setMyAppLanguage} />
      </Card>

      <form action={logout} className="mt-6">
        <button
          type="submit"
          className="min-h-12 w-full rounded-md border border-slate-300 bg-white text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
        >
          {t(locale, 'common.logout')}
        </button>
      </form>
    </>
  );
}
