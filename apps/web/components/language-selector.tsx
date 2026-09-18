'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Select } from '@/components/ui';
import { direction, localeLabelKeys, supportedLocales, t, type Locale } from '@/lib/i18n';
import { setLocale } from '@/app/dashboard/language-actions';

export function LanguageSelector({ locale, className }: { locale: Locale; className?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <label className={className ?? 'block px-3 py-2 text-sm'}>
      <span className="sr-only">{t(locale, 'common.language')}</span>
      <Select
        aria-label={t(locale, 'common.language')}
        defaultValue={locale}
        disabled={pending}
        onChange={(event) => {
          const next = event.target.value as Locale;
          startTransition(async () => {
            await setLocale(next);
            document.documentElement.lang = next;
            document.documentElement.dir = direction(next);
            router.refresh();
          });
        }}
      >
        {supportedLocales.map((value) => (
          <option key={value} value={value}>
            {t(locale, localeLabelKeys[value])}
          </option>
        ))}
      </Select>
    </label>
  );
}
