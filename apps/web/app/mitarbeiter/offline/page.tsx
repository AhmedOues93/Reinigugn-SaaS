import { EmployeePageHeader } from '@/components/employee/employee-shell';
import { CachedJobs } from '@/components/employee/cached-jobs';
import { employeeLocale, requireEmployee } from '@/lib/data/employee';
import { t } from '@/lib/i18n';

/**
 * The screen the service worker serves when a navigation cannot reach the
 * server. It renders only from the device-local snapshot, so it works with no
 * connection at all; time tracking, photos and messaging are not offered here
 * because they genuinely need the server.
 */
export default async function EmployeeOfflinePage() {
  const [{ user }, locale] = await Promise.all([requireEmployee(), employeeLocale()]);
  return (
    <>
      <EmployeePageHeader title={t(locale, 'emp.offline.cachedTitle')} />
      <CachedJobs locale={locale} userId={user.id} />
    </>
  );
}
