import Link from 'next/link';
import { Bell, ChevronRight, MessagesSquare, Plus } from 'lucide-react';
import { Badge, Card, EmptyState } from '@/components/ui';
import { EmployeePageHeader } from '@/components/employee/employee-shell';
import { employeeLocale, listMyNotifications, listMyThreads } from '@/lib/data/employee';
import { formatDateTime } from '@/lib/format';
import { t } from '@/lib/i18n';
import { markMyNotificationRead } from '../actions';

/**
 * Two things live on this screen, and they stay distinct: conversations with the
 * office, which the employee writes into, and the notifications the system
 * raises. Both come from the one notification system the app already had.
 */
export default async function EmployeeMessagesPage() {
  const [locale, threads, notifications] = await Promise.all([employeeLocale(), listMyThreads(), listMyNotifications(20)]);
  const systemNotifications = notifications.filter((item) => item.type !== 'MESSAGE_RECEIVED');

  return (
    <>
      <EmployeePageHeader title={t(locale, 'emp.messages.title')} />

      <div className="mb-4 flex justify-end">
        <Link
          href="/mitarbeiter/nachrichten/neu"
          className="inline-flex min-h-touch items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
        >
          <Plus className="size-4" aria-hidden="true" />
          {t(locale, 'emp.messages.new')}
        </Link>
      </div>

      {threads.length === 0 ? (
        <EmptyState
          icon={<MessagesSquare className="size-5" />}
          title={t(locale, 'emp.messages.empty')}
          body={t(locale, 'emp.messages.emptyBody')}
        />
      ) : (
        <ul className="space-y-3">
          {threads.map((thread) => (
            <li key={thread.id}>
              <Link
                href={`/mitarbeiter/nachrichten/${thread.id}`}
                className="flex min-h-touch items-center gap-3 rounded-lg border border-border bg-card p-4 shadow-card transition-colors hover:bg-muted"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="break-anywhere font-medium">{thread.subject}</span>
                    {Number(thread.unread_count) > 0 && (
                      <Badge tone="primary">{t(locale, 'emp.messages.unread', { count: Number(thread.unread_count) })}</Badge>
                    )}
                  </span>
                  {thread.last_message_preview && (
                    <span className="break-anywhere mt-1 block text-sm text-muted-foreground">{thread.last_message_preview}</span>
                  )}
                  <span className="mt-1 block text-xs text-muted-foreground">{formatDateTime(locale, thread.last_message_at)}</span>
                </span>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {systemNotifications.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <Bell className="size-4" aria-hidden="true" />
            {t(locale, 'nav.messages')}
          </h2>
          <ul className="space-y-3">
            {systemNotifications.map((item) => (
              <li key={item.id}>
                <Card className={`p-4 ${item.read_at ? '' : 'border-primary/30 bg-primary-soft/40'}`}>
                  <p className="break-anywhere font-medium">{item.title}</p>
                  {item.body && <p className="break-anywhere mt-1 text-sm text-muted-foreground">{item.body}</p>}
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">{formatDateTime(locale, item.created_at)}</p>
                    {item.job_id && (
                      <Link href={`/mitarbeiter/einsaetze/${item.job_id}`} className="inline-flex min-h-9 items-center text-sm font-semibold text-primary">
                        Einsatz öffnen
                        <ChevronRight className="ms-1 size-4 rtl:rotate-180" aria-hidden="true" />
                      </Link>
                    )}
                  </div>
                  {!item.read_at && (
                    <form
                      action={async () => {
                        'use server';
                        await markMyNotificationRead(item.id);
                      }}
                    >
                      <button type="submit" className="mt-2 inline-flex min-h-touch items-center text-sm font-medium text-primary underline">
                        {t(locale, 'common.markRead')}
                      </button>
                    </form>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
