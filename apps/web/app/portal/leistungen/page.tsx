import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ChevronRight, Clock, FileText } from 'lucide-react';
import { PortalPageHeader } from '@/components/portal/portal-shell';
import { Badge, EmptyState } from '@/components/ui';
import {
  listPortalAcceptances,
  listPortalServiceRecords,
  portalLocale,
  type PortalAcceptanceRow,
} from '@/lib/data/portal';
import { formatDate } from '@/lib/format';
import { t } from '@/lib/i18n';

/**
 * What was performed, and what the customer still has to accept.
 *
 * Kept deliberately separate from Rechnungen: this page is about work, that one
 * is about money. A customer is asked to confirm a *service*, never an invoice.
 */
export default async function PortalServicesPage() {
  const [locale, records, acceptances] = await Promise.all([
    portalLocale(),
    listPortalServiceRecords(),
    listPortalAcceptances(),
  ]);

  const byJob = new Map<string, PortalAcceptanceRow>(acceptances.map((row) => [row.job_id, row]));
  const waiting = acceptances.filter((row) => row.needs_my_action);

  const acceptanceBadge = (row: PortalAcceptanceRow | undefined) => {
    if (!row) return null;
    if (row.needs_my_action) {
      return (
        <Badge tone="warning">
          <Clock className="size-3.5" aria-hidden="true" />
          {t(locale, 'portal.acceptance.badgePending')}
        </Badge>
      );
    }
    if (row.status === 'PROBLEM_GEMELDET') {
      return (
        <Badge tone="danger">
          <AlertTriangle className="size-3.5" aria-hidden="true" />
          {t(locale, 'portal.acceptance.badgeProblem')}
        </Badge>
      );
    }
    if (row.status === 'ABGENOMMEN') {
      return (
        <Badge tone="success">
          <CheckCircle2 className="size-3.5" aria-hidden="true" />
          {t(locale, 'portal.acceptance.badgeAccepted')}
        </Badge>
      );
    }
    return null;
  };

  return (
    <>
      <PortalPageHeader title={t(locale, 'portal.services.title')} />

      {/* Anything the customer is actually being asked to do, said once, at the top. */}
      {waiting.length > 0 && (
        <p className="mb-4 flex items-start gap-2.5 rounded-lg border border-warning/25 bg-warning-soft px-4 py-3 text-sm leading-6 text-warning">
          <Clock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            {t(locale, 'portal.acceptance.waitingCount', { count: waiting.length })}
          </span>
        </p>
      )}

      {records.length === 0 ? (
        <EmptyState icon={<FileText className="size-5" />} title={t(locale, 'portal.services.empty')} />
      ) : (
        <ul className="space-y-3">
          {records.map((record) => {
            const acceptance = byJob.get(record.job_id);
            return (
              <li key={record.job_id}>
                <Link
                  href={`/portal/leistungen/${record.job_id}`}
                  className="flex items-center gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-primary"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">{record.object_name}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {formatDate(locale, record.scheduled_date, 'long')}
                    </p>
                    {record.total_items > 0 && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t(locale, 'emp.job.checklistProgress', { done: record.completed_items, total: record.total_items })}
                      </p>
                    )}
                    {acceptance && <div className="mt-2">{acceptanceBadge(acceptance)}</div>}
                  </div>
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
