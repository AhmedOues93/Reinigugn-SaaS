import { ButtonLink } from '@/components/ui';

const items = [
  ['Anfragen', '/dashboard/vertrieb/anfragen'],
  ['Besichtigungen', '/dashboard/vertrieb/besichtigungen'],
  ['Kalkulationen', '/dashboard/kalkulation'],
  ['Angebote', '/dashboard/vertrieb/angebote'],
] as const;

export function SalesSectionNav({ active }: { active: 'anfragen' | 'besichtigungen' | 'kalkulationen' | 'angebote' }) {
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
        <nav className="flex w-max items-center gap-1" aria-label="Vertrieb Bereiche">
          {items.map(([label, href]) => (
            <ButtonLink
              key={href}
              href={href}
              variant={href === activeHref ? 'default' : 'ghost'}
              className="shrink-0 px-3"
            >
              {label}
            </ButtonLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
