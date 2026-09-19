import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { Card } from '@/components/ui';
import { EmployeePageHeader } from '@/components/employee/employee-shell';
import { NewThreadForm } from '@/components/employee/message-composer';
import { employeeLocale } from '@/lib/data/employee';
import { t } from '@/lib/i18n';
import { startMyThread } from '../../actions';

export default async function NewEmployeeThreadPage() {
  const locale = await employeeLocale();
  return (
    <>
      <Link
        href="/mitarbeiter/nachrichten"
        className="mb-3 inline-flex min-h-touch items-center gap-1 text-sm font-medium text-muted-foreground"
      >
        <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
        {t(locale, 'common.back')}
      </Link>
      <EmployeePageHeader title={t(locale, 'emp.messages.new')} subtitle={t(locale, 'emp.messages.office')} />
      <Card className="p-5">
        <NewThreadForm locale={locale} action={startMyThread} />
      </Card>
    </>
  );
}
