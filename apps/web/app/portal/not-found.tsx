import Link from 'next/link';
import { portalLocale } from '@/lib/data/portal';
import { t } from '@/lib/i18n';

export default async function PortalNotFound() {
  const locale = await portalLocale();
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
      <p className="font-medium text-slate-900">{t(locale, 'common.notFound')}</p>
      <Link
        href="/portal"
        className="mt-5 inline-flex min-h-12 items-center justify-center rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground"
      >
        {t(locale, 'portal.tab.overview')}
      </Link>
    </div>
  );
}
