'use client';

import { useEffect } from 'react';
import { direction, type Locale } from '@/lib/i18n';

/**
 * Keeps `<html lang>` and `<html dir>` in step with the locale a surface actually
 * resolved. The root layout can only read the locale cookie, but an employee
 * without a cookie gets the language from their employee record and a portal
 * customer from the company default. Without this, the document attributes would
 * claim German while the page renders Ukrainian, which misleads screen readers
 * and the client-side fallbacks that read them.
 */
export function SyncDocumentLocale({ locale }: { locale: Locale }) {
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = direction(locale);
  }, [locale]);
  return null;
}
