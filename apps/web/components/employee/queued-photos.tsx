/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Loader2, RefreshCw, Trash2, UploadCloud } from 'lucide-react';
import { cn } from '@reinigung/ui';
import { useOffline } from '@/components/employee/offline-provider';
import { readPhotoBlob, type QueuedPhoto } from '@/lib/offline/store';

/**
 * Die Aufnahmen, die noch auf dem Geraet liegen.
 *
 * Sichtbar zu machen, was noch nicht angekommen ist, ist der halbe Zweck der
 * Warteschlange: eine Reinigungskraft, die nicht sieht, ob ihr Nachweis
 * gesendet wurde, fotografiert im Zweifel ein zweites Mal -- oder verlaesst
 * sich darauf und hat am Monatsende nichts.
 *
 * Eine Aufnahme verschwindet hier erst, wenn der Server ihre Speicherung
 * bestaetigt hat. Bis dahin bleibt sie mit ihrem Stand stehen.
 */
export function QueuedPhotos({ jobId }: { jobId: string }) {
  const offline = useOffline();
  const photos = (offline?.queuedPhotos ?? []).filter((photo) => photo.jobId === jobId);

  if (!offline || photos.length === 0) return null;

  return (
    <section aria-labelledby="queued-title" className="rounded-2xl border border-border/80 bg-subtle p-3.5">
      <h3 id="queued-title" className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <UploadCloud className="size-4 text-muted-foreground" aria-hidden="true" />
        {photos.length === 1 ? 'Eine Aufnahme wartet' : `${photos.length} Aufnahmen warten`}
      </h3>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        Sie liegen auf dem Gerät und werden gesendet, sobald wieder Netz da ist.
      </p>
      <ul className="mt-3 space-y-2">
        {photos.map((photo) => (
          <QueuedPhotoRow
            key={photo.id}
            photo={photo}
            onRetry={() => offline.retryPhoto(photo.id)}
            onDiscard={() => void offline.discardPhoto(photo.id)}
          />
        ))}
      </ul>
    </section>
  );
}

const label: Record<QueuedPhoto['category'], string> = {
  BEFORE: 'Vorher',
  AFTER: 'Nachher',
  DOCUMENTATION: 'Dokumentation',
};

function QueuedPhotoRow({
  photo,
  onRetry,
  onDiscard,
}: {
  photo: QueuedPhoto;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  const [thumbnail, setThumbnail] = useState<string | null>(null);

  // Das Bild liegt getrennt von seinem Eintrag, damit die Liste oben billig
  // bleibt. Für die Vorschau wird es hier einzeln nachgeladen.
  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    void readPhotoBlob(photo.id).then((blob) => {
      if (cancelled || !blob) return;
      url = URL.createObjectURL(blob);
      setThumbnail(url);
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [photo.id]);

  const failed = photo.status === 'failed';

  return (
    <li
      className={cn(
        'flex items-start gap-3 rounded-xl border bg-card p-2.5',
        failed ? 'border-danger/30' : 'border-border/70',
      )}
    >
      <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted">
        {thumbnail ? (
          <img src={thumbnail} alt="" className="size-full object-cover" />
        ) : (
          <UploadCloud className="size-5 text-muted-foreground/60" aria-hidden="true" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-foreground">{label[photo.category]}</p>
        <p
          className={cn('mt-0.5 flex items-center gap-1.5 text-xs', failed ? 'text-danger' : 'text-muted-foreground')}
        >
          {photo.status === 'uploading' && (
            <Loader2 className="size-3.5 shrink-0 motion-safe:animate-spin" aria-hidden="true" />
          )}
          {failed && <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />}
          <span className="break-anywhere">
            {photo.status === 'uploading'
              ? 'Wird gesendet …'
              : failed
                ? `Nicht gesendet${photo.attempts > 1 ? ` (${photo.attempts} Versuche)` : ''}`
                : 'Wartet auf Netz'}
          </span>
        </p>
        {failed && photo.lastError && (
          <p className="break-anywhere mt-1 text-xs leading-5 text-muted-foreground">{photo.lastError}</p>
        )}
        {failed && (
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex min-h-touch items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-subtle"
            >
              <RefreshCw className="size-3.5" aria-hidden="true" />
              Erneut senden
            </button>
            <button
              type="button"
              onClick={onDiscard}
              className="inline-flex min-h-touch items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-muted-foreground hover:text-danger"
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              Verwerfen
            </button>
          </div>
        )}
      </div>
    </li>
  );
}
