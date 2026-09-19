import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { Card } from '@/components/ui';
import { EmployeePageHeader } from '@/components/employee/employee-shell';
import { MessageThreadView } from '@/components/message-thread';
import { ReplyForm } from '@/components/employee/message-composer';
import { employeeLocale, listMyThreads, listThreadMessages, markThreadReadForCurrentUser } from '@/lib/data/employee';
import { t } from '@/lib/i18n';
import { sendMyMessage } from '../../actions';

export default async function EmployeeThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [locale, threads, messages] = await Promise.all([employeeLocale(), listMyThreads(), listThreadMessages(id)]);
  const thread = threads.find((item) => item.id === id);
  // A thread the caller may not read comes back empty from the database, so a
  // missing row and a forbidden row look the same from here — as they should.
  if (!thread || !messages) notFound();
  await markThreadReadForCurrentUser(id);

  return (
    <>
      <Link
        href="/mitarbeiter/nachrichten"
        className="mb-3 inline-flex min-h-touch items-center gap-1 text-sm font-medium text-muted-foreground"
      >
        <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
        {t(locale, 'common.back')}
      </Link>
      <EmployeePageHeader title={thread.subject} subtitle={t(locale, 'emp.messages.office')} />
      <Card className="p-5">
        <MessageThreadView messages={messages} locale={locale} />
        <ReplyForm locale={locale} action={sendMyMessage.bind(null, id)} />
      </Card>
    </>
  );
}
