import Link from 'next/link';
import { MessageSquareWarning, Plus } from 'lucide-react';
import { PortalPageHeader } from '@/components/portal/portal-shell';
import { EmptyState } from '@/components/ui';
import { listPortalComplaints, portalLocale } from '@/lib/data/portal';
import { formatDateTime } from '@/lib/format';
import { t } from '@/lib/i18n';

const statusTone: Record<string, string> = {
  OPEN: 'bg-amber-100 text-amber-900',
  IN_PROGRESS: 'bg-blue-50 text-blue-700',
  RESOLVED: 'bg-primary/10 text-primary',
  CLOSED: 'bg-slate-100 text-muted-foreground',
};

export default async function PortalComplaintsPage() {
  const [locale, complaints] = await Promise.all([portalLocale(), listPortalComplaints()]);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <PortalPageHeader title={t(locale, 'portal.complaints.title')} />
        <Link
          href="/portal/reklamationen/neu"
          className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
        >
          <Plus className="size-4" aria-hidden="true" />
          {t(locale, 'portal.complaints.new')}
        </Link>
      </div>

      {complaints.length === 0 ? (
        <EmptyState icon={<MessageSquareWarning className="size-5" />} title={t(locale, 'portal.complaints.empty')} />
      ) : (
        <ul className="space-y-3">
          {complaints.map((complaint) => (
            <li key={complaint.id} className="rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{complaint.title}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {complaint.object_name} · {formatDateTime(locale, complaint.created_at)}
                  </p>
                </div>
                <span className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${statusTone[complaint.status]}`}>
                  {t(locale, `status.${complaint.status}`)}
                </span>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{complaint.description}</p>
              {complaint.updates.length > 0 && (
                <ol className="mt-4 space-y-2 border-t pt-3">
                  {complaint.updates.map((update, index) => (
                    <li key={index} className="text-sm">
                      <p className="text-slate-700">{update.note}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{formatDateTime(locale, update.created_at)}</p>
                    </li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
