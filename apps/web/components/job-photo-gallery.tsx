/* eslint-disable @next/next/no-img-element */
'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { FormMessage } from '@/components/form-controls';
import { initialFormState } from '@/lib/actions';
import type { JobPhoto } from '@/lib/data/job-photos';

const categoryLabel = { BEFORE: 'Vorher', AFTER: 'Nachher', DOCUMENTATION: 'Dokumentation' } as const;
type DeleteAction = (state: typeof initialFormState, formData: FormData) => Promise<typeof initialFormState>;

function DeleteButton() { const { pending } = useFormStatus(); return <button type="submit" disabled={pending} className="mt-3 text-sm font-medium text-red-700 disabled:opacity-60">{pending ? 'Wird entfernt...' : 'Foto entfernen'}</button>; }

function PhotoCard({ photo, canDelete, deleteAction }: { photo: JobPhoto; canDelete: boolean; deleteAction: (photoId: string, state: typeof initialFormState, formData: FormData) => Promise<typeof initialFormState> }) {
  const [state, formAction] = useActionState(deleteAction.bind(null, photo.id) as DeleteAction, initialFormState);
  return <article className="overflow-hidden rounded-lg border bg-white"><div className="aspect-[4/3] bg-slate-100">{photo.url ? <img src={photo.url} alt={`${categoryLabel[photo.category]}: ${photo.description ?? 'Einsatzfoto'}`} className="size-full object-cover" /> : <p className="p-4 text-sm text-slate-600">Foto kann nicht geladen werden.</p>}</div><div className="p-4"><p className="text-sm font-semibold">{categoryLabel[photo.category]}</p><p className="mt-1 text-xs text-slate-500">{photo.uploader} · {new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(photo.created_at))}</p>{photo.checklist_item && <p className="mt-2 text-sm text-slate-700">Checklistenpunkt: {photo.checklist_item.title}</p>}{photo.description && <p className="mt-2 text-sm text-slate-700">{photo.description}</p>}{canDelete && <form action={formAction}><DeleteButton /></form>}<FormMessage status={state.status} message={state.message} /></div></article>;
}

export function JobPhotoGallery({ photos, canDelete, deleteAction }: { photos: JobPhoto[]; canDelete: (photo: JobPhoto) => boolean; deleteAction: (photoId: string, state: typeof initialFormState, formData: FormData) => Promise<typeof initialFormState> }) {
  return <section className="mt-6"><div className="mb-3"><h2 className="text-lg font-semibold">Fotodokumentation</h2><p className="mt-1 text-sm text-slate-600">{photos.length === 0 ? 'Noch keine Fotos dokumentiert.' : `${photos.length} Foto${photos.length === 1 ? '' : 's'} dokumentiert.`}</p></div>{photos.length > 0 && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{photos.map((photo) => <PhotoCard key={photo.id} photo={photo} canDelete={canDelete(photo)} deleteAction={deleteAction} />)}</div>}</section>;
}
