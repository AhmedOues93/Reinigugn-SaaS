import Link from 'next/link';
import { Bell, ChevronRight, MessagesSquare } from 'lucide-react';
import { Badge, Card, CardHeader, EmptyState, PageHeader } from '@/components/ui';
import { SubmitButton } from '@/components/form-controls';
import { getCurrentCompany } from '@/lib/auth';
import { listMyThreads } from '@/lib/data/employee';
import { markNotificationRead } from './actions';

/**
 * The office side of the same messaging system the employee app uses. Threads
 * come from `list_my_threads`, which returns every thread of the caller's own
 * company for a staff role and only their own for an employee — the tenant and
 * the role are resolved in the database, not here.
 */
export default async function StaffMessagesPage() {
  const { supabase, membership } = await getCurrentCompany();
  if (!membership) return null;
  const [threads, { data: notifications }] = await Promise.all([
    listMyThreads(),
    supabase
      .from('in_app_notifications')
      .select('id,title,body,type,read_at,created_at')
      .eq('recipient_member_id', membership.id)
      .neq('type', 'MESSAGE_RECEIVED')
      .order('created_at', { ascending: false })
      .limit(50),
  ]);
  const formatTime = (value: string) =>
    new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Nachrichten" description="Unterhaltungen mit Mitarbeitern und Systembenachrichtigungen." />

      <Card className="mt-6">
        <CardHeader title="Unterhaltungen mit Mitarbeitern" />
        {threads.length === 0 ? (
          <div className="p-5">
            <EmptyState icon={<MessagesSquare className="size-5" />} title="Keine Unterhaltungen" body="Mitarbeiter können das Büro aus der Mitarbeiter-App heraus anschreiben." />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {threads.map((thread) => (
              <li key={thread.id}>
                <Link
                  href={`/dashboard/nachrichten/${thread.id}`}
                  className="flex min-h-touch items-center gap-3 p-5 transition-colors hover:bg-muted"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="break-anywhere font-medium">{thread.subject}</span>
                      {Number(thread.unread_count) > 0 && <Badge tone="primary">{Number(thread.unread_count)} ungelesen</Badge>}
                    </span>
                    <span className="mt-1 block text-sm text-muted-foreground">{thread.employee_name}</span>
                    {thread.last_message_preview && (
                      <span className="break-anywhere mt-1 block text-sm text-muted-foreground">{thread.last_message_preview}</span>
                    )}
                    <span className="mt-1 block text-xs text-muted-foreground">{formatTime(thread.last_message_at)}</span>
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader title="Benachrichtigungen" />
        {(notifications ?? []).length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">Keine Benachrichtigungen vorhanden.</p>
        ) : (
          <div className="divide-y divide-border">
            {notifications?.map((item) => (
              <article className={`p-5 ${item.read_at ? '' : 'bg-primary-soft'}`} key={item.id}>
                <p className="break-anywhere font-medium">{item.title}</p>
                {item.body && <p className="break-anywhere mt-1 text-sm text-muted-foreground">{item.body}</p>}
                <p className="mt-2 text-xs text-muted-foreground">{formatTime(item.created_at)}</p>
                {!item.read_at && (
                  <form className="mt-3" action={markNotificationRead.bind(null, item.id)}>
                    <SubmitButton variant="ghost" size="sm">
                      Als gelesen markieren
                    </SubmitButton>
                  </form>
                )}
              </article>
            ))}
          </div>
        )}
      </Card>

      <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
        <Bell className="size-3.5" aria-hidden="true" />
        Nachrichten und Benachrichtigungen nutzen dasselbe System — es gibt keine zweite Mitarbeiterverwaltung.
      </p>
    </div>
  );
}
