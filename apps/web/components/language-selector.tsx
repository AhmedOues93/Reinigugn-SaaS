'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { type Locale, t } from '@/lib/i18n';
import { setLocale } from '@/app/dashboard/language-actions';

export function LanguageSelector({ locale }: { locale: Locale }) {
  const router = useRouter(); const [pending, startTransition] = useTransition();
  return <label className="block px-3 py-2 text-sm"><span className="sr-only">{t(locale, 'common.language')}</span><select aria-label={t(locale, 'common.language')} className="w-full rounded border bg-white px-2 py-1.5 text-sm" defaultValue={locale} disabled={pending} onChange={(event) => startTransition(async () => { await setLocale(event.target.value); document.documentElement.lang = event.target.value; document.documentElement.dir = event.target.value === 'ar' ? 'rtl' : 'ltr'; router.refresh(); })}><option value="de">{t(locale, 'common.german')}</option><option value="en">{t(locale, 'common.english')}</option><option value="ar">{t(locale, 'common.arabic')}</option></select></label>;
}
