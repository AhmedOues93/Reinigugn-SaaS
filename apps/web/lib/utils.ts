import { siteUrl } from '@/lib/env';

/** An absolute application URL, for links that leave the app (e-mail, PDFs). */
export function appUrl(path = '/') {
  return new URL(path, siteUrl()).toString();
}
