import { ButtonLink } from '@/components/ui';
import { t, type Locale } from '@/lib/i18n';

const items = [
  ['nav.leads', '/dashboard/vertrieb/anfragen'],
  ['nav.surveys', '/dashboard/vertrieb/besichtigungen'],
  ['nav.calculation', '/dashboard/kalkulation'],
  ['nav.quotes', '/dashboard/vertrieb/angebote'],
] as const;

export function SalesSectionNav({
  active,
  locale,
}: {
  active: 'anfragen' | 'besichtigungen' | 'kalkulationen' | 'angebote';
  locale: Locale;
}) {
  const activeHref =
    active === 'anfragen'
      ? '/dashboard/vertrieb/anfragen'
      : active === 'besichtigungen'
        ? '/dashboard/vertrieb/besichtigungen'
        : active === 'kalkulationen'
          ? '/dashboard/kalkulation'
          : '/dashboard/vertrieb/angebote';

  return (
    <div className="mb-5 flex justify-center">
      <div className="max-w-full overflow-x-auto rounded-xl border border-border bg-card p-1.5 shadow-sm">
        <nav className="flex w-max items-center gap-1" aria-label={t(locale, 'nav.sales')}>
          {items.map(([key, href]) => (
            <ButtonLink
              key={href}
              href={href}
              variant={href === activeHref ? 'default' : 'ghost'}
              className="shrink-0 px-3"
            >
              {t(locale, key)}
            </ButtonLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
