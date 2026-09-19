import Link from 'next/link';
import { employeeLocale } from '@/lib/data/employee';
import { t } from '@/lib/i18n';

export default async function EmployeeNotFound() {
  const locale = await employeeLocale();
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
      <p className="font-medium text-slate-900">{t(locale, 'common.notFound')}</p>
      <Link
        href="/mitarbeiter"
        className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
      >
        {t(locale, 'emp.tab.today')}
      </Link>
    </div>
  );
}
