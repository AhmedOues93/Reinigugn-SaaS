import Link from 'next/link';
import { ChevronRight, FileText } from 'lucide-react';
import { PortalPageHeader } from '@/components/portal/portal-shell';
import { EmptyState } from '@/components/ui';
import { listPortalServiceRecords, portalLocale } from '@/lib/data/portal';
import { formatDate } from '@/lib/format';
import { t } from '@/lib/i18n';

export default async function PortalServicesPage() {
  const [locale, records] = await Promise.all([portalLocale(), listPortalServiceRecords()]);

  return (
    <>
      <PortalPageHeader title={t(locale, 'portal.services.title')} />
      {records.length === 0 ? (
        <EmptyState icon={<FileText className="size-5" />} title={t(locale, 'portal.services.empty')} />
      ) : (
        <ul className="space-y-3">
          {records.map((record) => (
            <li key={record.job_id}>
              <Link
                href={`/portal/leistungen/${record.job_id}`}
                className="flex items-center gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-primary"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">{record.object_name}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{formatDate(locale, record.scheduled_date, 'long')}</p>
                  {record.total_items > 0 && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t(locale, 'emp.job.checklistProgress', { done: record.completed_items, total: record.total_items })}
                    </p>
                  )}
                </div>
                <ChevronRight className="size-5 shrink-0 text-slate-400 rtl:rotate-180" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
