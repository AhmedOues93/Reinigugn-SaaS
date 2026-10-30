import { BrandSplash } from '@/components/brand-splash';
import { t } from '@/lib/i18n';
import { currentLocale } from '@/lib/i18n-server';

/**
 * Root loading state: shown while the session is being resolved and the first
 * authenticated segment streams. Next decides when — nothing here delays it.
 */
export default async function RootLoading() {
  const locale = await currentLocale();
  return <BrandSplash message={t(locale, 'common.loadingSession')} />;
}
