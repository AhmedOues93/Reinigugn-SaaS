'use client';

import { useEffect, useState } from 'react';
import { defaultLocale, isLocale, type Locale } from '@/lib/i18n';

/**
 * The active locale for client components that cannot await a server call, such
 * as an error boundary. The root layout writes it to `<html lang>`, and the
 * language pickers keep that attribute in step, so reading it needs no extra
 * round trip. Starts at the German default so server and first client render
 * agree, then settles on the real value.
 */
export function useDocumentLocale(): Locale {
  const [locale, setLocale] = useState<Locale>(defaultLocale);
  useEffect(() => {
    const value = document.documentElement.lang;
    if (isLocale(value)) setLocale(value);
  }, []);
  return locale;
}
