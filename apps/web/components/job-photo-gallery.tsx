/* eslint-disable @next/next/no-img-element -- signed, short-lived storage URLs */
'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { FormMessage } from '@/components/form-controls';
import { Card, EmptyState } from '@/components/ui';
import { initialFormState } from '@/lib/actions';
import type { JobPhoto } from '@/lib/data/job-photos';
import { formatDateTime } from '@/lib/format';
import { t, type Locale } from '@/lib/i18n';

type DeleteAction = (state: typeof initialFormState, formData: FormData) => Promise<typeof initialFormState>;
type BoundDeleteAction = (photoId: string, state: typeof initialFormState, formData: FormData) => Promise<typeof initialFormState>;

const categoryKeys = {
  BEFORE: 'emp.photo.before',
  AFTER: 'emp.photo.after',
  DOCUMENTATION: 'emp.photo.documentation',
} as const;

function DeleteButton({ locale }: { locale: Locale }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-3 inline-flex min-h-touch items-center text-sm font-medium text-danger disabled:opacity-60"
    >
      {pending ? t(locale, 'common.saving') : t(locale, 'common.cancel')}
    </button>
  );
}

function PhotoCard({
  photo,
  canDelete,
  deleteAction,
  locale,
}: {
  photo: JobPhoto;
  canDelete: boolean;
  deleteAction: BoundDeleteAction;
  locale: Locale;
}) {
  const [state, formAction] = useActionState(deleteAction.bind(null, photo.id) as DeleteAction, initialFormState);
  const category = t(locale, categoryKeys[photo.category]);

  return (
    <Card className="overflow-hidden rounded-2xl">
      <div className="aspect-[4/3] bg-muted">
        {photo.url ? (
          <img src={photo.url} alt={`${category}: ${photo.description ?? ''}`} className="size-full object-cover" loading="lazy" />
        ) : (
          <p className="p-4 text-sm text-muted-foreground">{t(locale, 'common.errorBody')}</p>
        )}
      </div>
      <div className="p-4">
        <p className="text-sm font-semibold">{category}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {photo.uploader} · {formatDateTime(locale, photo.created_at)}
        </p>
        {photo.checklist_item && <p className="mt-2 text-sm">{photo.checklist_item.title}</p>}
        {photo.description && <p className="break-anywhere mt-2 text-sm">{photo.description}</p>}
        {canDelete && (
          <form action={formAction}>
            <DeleteButton locale={locale} />
          </form>
        )}
        <FormMessage status={state.status} message={state.message} />
      </div>
    </Card>
  );
}

/**
 * Photo documentation.
 *
 * `deletablePhotoIds` is a plain array rather than a `(photo) => boolean`
 * predicate: this is a client component, and React cannot serialise a function
 * prop across the server boundary — passing one threw
 * "Functions cannot be passed directly to Client Components" at render time.
 * The decision is made on the server, where the membership is known anyway.
 */
export function JobPhotoGallery({
  photos,
  deletablePhotoIds,
  deleteAction,
  locale = 'de',
}: {
  photos: JobPhoto[];
  deletablePhotoIds: string[];
  deleteAction: BoundDeleteAction;
  locale?: Locale;
}) {
  const deletable = new Set(deletablePhotoIds);
  const groups = [
    { key: 'BEFORE' as const, label: t(locale, 'emp.photo.before') },
    { key: 'AFTER' as const, label: t(locale, 'emp.photo.after') },
    { key: 'DOCUMENTATION' as const, label: t(locale, 'emp.photo.documentation') },
  ];

  return (
    <section className="mt-5">
      {photos.length === 0 ? (
        <EmptyState title={t(locale, 'emp.job.photos')} body="Noch keine Fotos gespeichert." />
      ) : (
        <div className="space-y-5">
          {groups.map((group) => {
            const items = photos.filter((photo) => photo.category === group.key);
            if (items.length === 0) return null;
            return (
              <div key={group.key}>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">{group.label}</h3>
                  <span className="text-xs text-muted-foreground">{items.length}</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {items.map((photo) => (
                    <PhotoCard
                      key={photo.id}
                      photo={photo}
                      canDelete={deletable.has(photo.id)}
                      deleteAction={deleteAction}
                      locale={locale}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
