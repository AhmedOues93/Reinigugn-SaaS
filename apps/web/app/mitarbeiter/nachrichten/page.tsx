import { MessageSquare } from 'lucide-react';
import { EmployeePageHeader, EmptyState } from '@/components/employee/employee-shell';
import { employeeLocale, listMyNotifications } from '@/lib/data/employee';
import { formatDateTime } from '@/lib/format';
import { t } from '@/lib/i18n';
import { markMyNotificationRead } from '../actions';

export default async function EmployeeNotificationsPage() {
  const [locale, notifications] = await Promise.all([employeeLocale(), listMyNotifications()]);

  return (
    <>
      <EmployeePageHeader title={t(locale, 'emp.messages.title')} />
      {notifications.length === 0 ? (
        <EmptyState icon={<MessageSquare className="size-5" />} title={t(locale, 'emp.messages.empty')} />
      ) : (
        <ul className="space-y-3">
          {notifications.map((item) => (
            <li
              key={item.id}
              className={`rounded-lg border p-4 ${item.read_at ? 'bg-white' : 'border-primary/30 bg-primary/5'}`}
            >
              <p className="font-medium text-slate-900">{item.title}</p>
              {item.body && <p className="mt-1 text-sm text-slate-600">{item.body}</p>}
              <p className="mt-2 text-xs text-slate-500">{formatDateTime(locale, item.created_at)}</p>
              {!item.read_at && (
                <form
                  action={async () => {
                    'use server';
                    await markMyNotificationRead(item.id);
                  }}
                >
                  <button type="submit" className="mt-3 min-h-11 text-sm font-medium text-primary underline">
                    {t(locale, 'common.markRead')}
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
