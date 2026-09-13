export const MAX_JOB_PHOTO_SIZE = 10 * 1024 * 1024;
export const JOB_PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export function validateJobPhotoFile(file: { type: string; size: number }) {
  if (!JOB_PHOTO_MIME_TYPES.includes(file.type as (typeof JOB_PHOTO_MIME_TYPES)[number])) return 'Bitte wähle ein JPG-, PNG- oder WebP-Bild aus.';
  if (file.size < 1) return 'Die Bilddatei ist leer.';
  if (file.size > MAX_JOB_PHOTO_SIZE) return 'Das Bild darf maximal 10 MB gross sein.';
  return null;
}

export function jobPhotoExtension(type: string) {
  return type === 'image/jpeg' ? 'jpg' : type === 'image/png' ? 'png' : 'webp';
}
