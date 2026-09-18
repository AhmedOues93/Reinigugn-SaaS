import { Card } from '@/components/ui';
import { PortalPageHeader } from '@/components/portal/portal-shell';
import { LanguageSelector } from '@/components/language-selector';
import { logout } from '@/app/(auth)/actions';
import { getPortalOverview, portalLocale, requirePortalCustomer } from '@/lib/data/portal';
import { t } from '@/lib/i18n';

export default async function PortalProfilePage() {
  const [{ user, profile }, locale, overview] = await Promise.all([requirePortalCustomer(), portalLocale(), getPortalOverview()]);
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ');

  return (
    <>
      <PortalPageHeader title={t(locale, 'portal.profile.title')} />
      <Card className="p-5">
        <dl className="space-y-4 text-sm">
          <div>
            <dt className="text-slate-500">{t(locale, 'role.CUSTOMER')}</dt>
            <dd className="mt-1 font-medium">{overview?.customerName}</dd>
          </div>
          {overview?.customerNumber && (
            <div>
              <dt className="text-slate-500">{t(locale, 'emp.profile.employeeNumber')}</dt>
              <dd className="mt-1 font-medium">{overview.customerNumber}</dd>
            </div>
          )}
          <div>
            <dt className="text-slate-500">{t(locale, 'common.customerAccess')}</dt>
            <dd className="mt-1 font-medium">{name || user.email}</dd>
          </div>
        </dl>
      </Card>

      <Card className="mt-4 p-5">
        <h2 className="font-semibold">{t(locale, 'common.language')}</h2>
        <div className="mt-3">
          <LanguageSelector locale={locale} className="block" />
        </div>
      </Card>

      <form action={logout} className="mt-6">
        <button
          type="submit"
          className="min-h-12 w-full rounded-md border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 sm:w-auto sm:px-6"
        >
          {t(locale, 'common.logout')}
        </button>
      </form>
    </>
  );
}
