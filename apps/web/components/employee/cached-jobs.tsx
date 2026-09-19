'use client';

import { useEffect, useState } from 'react';
import { CloudOff, KeyRound, MapPin, Phone, User } from 'lucide-react';
import { Badge, Card, EmptyState } from '@/components/ui';
import { useOffline } from '@/components/employee/offline-provider';
import { readSnapshot, type CachedJob, type CachedSnapshot } from '@/lib/offline/store';
import { formatDate, formatDateTime, formatTimeRange } from '@/lib/format';
import { t, type Locale } from '@/lib/i18n';

/**
 * What the app can still show with no connection: the assigned visits saved on
 * this device for this user, read straight back out of IndexedDB. Nothing is
 * fetched, and nothing belonging to another user can appear — the snapshot is
 * keyed by user id and a read for a different id returns nothing.
 */
export function CachedJobs({ locale, userId }: { locale: Locale; userId: string }) {
  const offline = useOffline();
  const [snapshot, setSnapshot] = useState<CachedSnapshot | null | undefined>(undefined);

  useEffect(() => {
    void readSnapshot(userId).then(setSnapshot);
  }, [userId]);

  if (snapshot === undefined) return <p className="text-sm text-muted-foreground">{t(locale, 'common.loading')}</p>;
  if (!snapshot || snapshot.jobs.length === 0) {
    return <EmptyState icon={<CloudOff className="size-5" />} title={t(locale, 'emp.today.noJobs')} body={t(locale, 'emp.today.noJobsBody')} />;
  }

  return (
    <>
      <p className="mb-4 text-xs text-muted-foreground">
        {t(locale, 'emp.sync.cachedAt', { time: formatDateTime(locale, snapshot.cachedAt) })}
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {snapshot.jobs.map((job) => (
          <CachedJobCard key={job.id} job={job} locale={locale} />
        ))}
      </div>
      {offline && offline.pending > 0 && (
        <p className="mt-4 text-sm text-muted-foreground">{t(locale, 'emp.sync.pending', { count: offline.pending })}</p>
      )}
    </>
  );
}

function CachedJobCard({ job, locale }: { job: CachedJob; locale: Locale }) {
  const done = job.checklist.filter((item) => item.completed_at).length;
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="break-anywhere text-base font-semibold">{job.objectName || job.title}</h2>
        <Badge tone={job.status === 'COMPLETED' ? 'success' : 'neutral'}>{t(locale, `status.${job.status}`)}</Badge>
      </div>
      {job.customerName && <p className="mt-1 text-sm text-muted-foreground">{job.customerName}</p>}
      <p className="mt-2 text-sm tabular-nums text-muted-foreground">
        {formatDate(locale, job.scheduled_date, 'long')} · {formatTimeRange(locale, job.planned_start_at, job.planned_end_at)}
      </p>
      {job.address && (
        <p className="mt-3 flex items-start gap-2 text-sm">
          <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="break-anywhere">{job.address}</span>
        </p>
      )}
      {job.contactPerson && (
        <p className="mt-2 flex items-start gap-2 text-sm">
          <User className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="break-anywhere">{job.contactPerson}</span>
        </p>
      )}
      {job.contactPhone && (
        <a href={`tel:${job.contactPhone.replace(/\s/g, '')}`} className="mt-2 flex min-h-touch items-center gap-2 text-sm font-semibold text-primary">
          <Phone className="size-4 shrink-0" aria-hidden="true" />
          {job.contactPhone}
        </a>
      )}
      {job.accessInstructions && (
        <p className="mt-2 flex items-start gap-2 text-sm">
          <KeyRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="break-anywhere whitespace-pre-wrap">{job.accessInstructions}</span>
        </p>
      )}
      {job.employee_instructions && (
        <p className="break-anywhere mt-3 whitespace-pre-wrap rounded-md bg-warning-soft p-3 text-sm text-warning">
          {job.employee_instructions}
        </p>
      )}
      {job.checklist.length > 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          {t(locale, 'emp.job.checklistProgress', { done, total: job.checklist.length })}
        </p>
      )}
    </Card>
  );
}
