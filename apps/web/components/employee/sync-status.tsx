'use client';

import { CloudOff, RefreshCw, Check, TriangleAlert } from 'lucide-react';
import { useOffline } from '@/components/employee/offline-provider';
import { t, type Locale } from '@/lib/i18n';

const tones = {
  offline: 'bg-muted text-muted-foreground',
  syncing: 'bg-primary-soft text-primary',
  synced: 'bg-success-soft text-success',
  failed: 'bg-danger-soft text-danger',
} as const;

const icons = { offline: CloudOff, syncing: RefreshCw, synced: Check, failed: TriangleAlert };

/** The connection state, stated plainly rather than left to a silent spinner. */
export function SyncStatus({ locale }: { locale: Locale }) {
  const offline = useOffline();
  if (!offline) return null;
  const Icon = icons[offline.state];
  return (
    <span
      role="status"
      aria-live="polite"
      className={`inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold ${tones[offline.state]}`}
    >
      <Icon className={`size-3.5 shrink-0 ${offline.state === 'syncing' ? 'motion-safe:animate-spin' : ''}`} aria-hidden="true" />
      <span className="md:hidden lg:inline">{t(locale, `emp.sync.${offline.state}`)}</span>
      <span className="sr-only hidden md:inline lg:hidden">{t(locale, `emp.sync.${offline.state}`)}</span>
      {offline.pending > 0 && <span className="tabular-nums">{offline.pending}</span>}
    </span>
  );
}

/** A full-width explanation shown only while something actually needs saying. */
export function SyncBanner({ locale }: { locale: Locale }) {
  const offline = useOffline();
  if (!offline) return null;

  if (offline.state === 'failed') {
    return (
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md bg-danger-soft p-3 text-sm text-danger" role="alert">
        <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1">{t(locale, 'emp.sync.pending', { count: offline.pending })}</span>
        <button
          type="button"
          onClick={offline.sync}
          className="inline-flex min-h-touch items-center rounded-md border border-danger/30 px-3 font-semibold"
        >
          {t(locale, 'emp.sync.retry')}
        </button>
      </div>
    );
  }

  if (offline.conflicts > 0) {
    return (
      <p className="mb-4 rounded-md bg-warning-soft p-3 text-sm text-warning" role="status">
        {t(locale, 'emp.sync.conflict')}
      </p>
    );
  }

  if (!offline.online) {
    return (
      <p className="mb-4 flex items-start gap-2.5 rounded-md bg-muted p-3 text-sm text-muted-foreground" role="status">
        <CloudOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0">{t(locale, 'emp.sync.offlineBanner')}</span>
      </p>
    );
  }

  return null;
}
