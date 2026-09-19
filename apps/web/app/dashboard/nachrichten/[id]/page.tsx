import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui';
import { MessageThreadView } from '@/components/message-thread';
import { StaffReplyForm } from '@/components/staff-reply-form';
import { listMyThreads, listThreadMessages, markThreadReadForCurrentUser } from '@/lib/data/employee';
import { requireStaffCompany } from '@/lib/auth';
import { replyToThread } from '../actions';

export default async function StaffThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireStaffCompany();
  const [threads, messages] = await Promise.all([listMyThreads(), listThreadMessages(id)]);
  const thread = threads.find((item) => item.id === id);
  // A thread outside the caller's company returns nothing from the database, so
  // it is indistinguishable from one that does not exist.
  if (!thread || !messages) notFound();
  await markThreadReadForCurrentUser(id);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/dashboard/nachrichten" className="mb-5 inline-flex min-h-touch items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary">
        <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
        Zurück zu Nachrichten
      </Link>
      <Card>
        <CardHeader title={thread.subject} description={thread.employee_name} />
        <div className="p-5">
          <MessageThreadView messages={messages} locale="de" />
          <StaffReplyForm action={replyToThread.bind(null, id)} />
        </div>
      </Card>
    </div>
  );
}
