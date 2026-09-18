import Link from 'next/link';
import { cn } from '@reinigung/ui';
import type { CompanyBranding } from '@/lib/data/branding';

/**
 * The single branding lockup. Dashboard, employee app and customer portal all use
 * it so a tenant logo appears identically everywhere, with the product wordmark as
 * the fallback when no logo has been uploaded.
 */
export function CompanyBrand({
  branding,
  href,
  size = 'md',
  className,
}: {
  branding: Pick<CompanyBranding, 'name' | 'logoUrl'> | null;
  href?: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const imageClass = size === 'sm' ? 'max-h-7 max-w-[7rem]' : 'max-h-9 max-w-[10rem]';
  const content = branding?.logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived storage URL
    <img src={branding.logoUrl} alt={branding.name} className={cn('w-auto object-contain', imageClass)} />
  ) : (
    <span className={cn('font-semibold tracking-tight', size === 'sm' ? 'text-base' : 'text-lg')}>
      {branding?.name ?? (
        <>
          Sauber<span className="text-primary">Werk</span>
        </>
      )}
    </span>
  );

  const wrapperClass = cn('flex min-h-11 items-center gap-2', className);
  return href ? (
    <Link href={href} className={wrapperClass} aria-label={branding?.name ?? 'SauberWerk'}>
      {content}
    </Link>
  ) : (
    <span className={wrapperClass}>{content}</span>
  );
}

/** Product wordmark for unauthenticated screens, where no tenant is known yet. */
export function ProductBrand({ className }: { className?: string }) {
  return (
    <span className={cn('text-lg font-semibold tracking-tight', className)}>
      Sauber<span className="text-primary">Werk</span>
    </span>
  );
}
