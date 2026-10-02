'use client';

import { useState } from 'react';
import { Camera, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { JobPhotoUpload } from '@/components/job-photo-upload';
import { JobPhotoGallery } from '@/components/job-photo-gallery';
import type { initialFormState } from '@/lib/actions';

type Photo = Parameters<typeof JobPhotoGallery>[0]['photos'];
type UploadAction = (state: typeof initialFormState, formData: FormData) => Promise<typeof initialFormState>;
type DeleteAction = Parameters<typeof JobPhotoGallery>[0]['deleteAction'];

export function ComplaintPhotoSection({
  photos,
  uploadAction,
  deleteAction,
}: {
  photos: Photo;
  uploadAction: UploadAction;
  deleteAction: DeleteAction;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-3">
      {photos.length > 0 ? (
        <JobPhotoGallery
          photos={photos}
          deletablePhotoIds={photos.map((photo) => photo.id)}
          deleteAction={deleteAction}
        />
      ) : (
        <p className="text-sm text-muted-foreground">Noch keine Fotos.</p>
      )}

      {!open ? (
        <Button type="button" variant="outline" onClick={() => setOpen(true)}>
          <Plus className="size-4" aria-hidden="true" />
          Foto hinzufügen
        </Button>
      ) : (
        <div className="rounded-xl border border-border/80 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Camera className="size-4 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-semibold">Foto hinzufügen</p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              <X className="size-4" aria-hidden="true" />
              Schließen
            </Button>
          </div>
          <JobPhotoUpload action={uploadAction} checklistItems={[]} />
        </div>
      )}
    </div>
  );
}
