import Link from 'next/link';
import { cn } from '@reinigung/ui';
import { BrandMark } from '@/components/brand-mark';
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
          Rein<span className="text-primary">Plan</span>
        </>
      )}
    </span>
  );

  const wrapperClass = cn('flex min-h-11 items-center gap-2', className);
  return href ? (
    <Link href={href} className={wrapperClass} aria-label={branding?.name ?? 'ReinPlan'}>
      {content}
    </Link>
  ) : (
    <span className={wrapperClass}>{content}</span>
  );
}

/**
 * The official ReinPlan lockup: the mark and the wordmark, on a dark surface.
 *
 * This is the product speaking, not the tenant. It belongs at the top of a
 * navigation rail, where the question being answered is "which software am I
 * in" — the tenant's own name answers a different question and already sits at
 * the foot of the same rail.
 *
 * Drawn rather than loaded. The rails tint any <img> with
 * `brightness-0 invert` so a dark tenant logo stays legible on Tiefsee, which
 * turns a light or mostly-transparent PNG into a plain white rectangle. A mark
 * that takes its colour from `currentColor` cannot break that way.
 */
export function ProductLockup({ href, className }: { href?: string; className?: string }) {
  const content = (
    <>
      <BrandMark className="size-8 shrink-0 text-highlight" />
      <span className="truncate text-[1.15rem] font-semibold tracking-tight text-white">
        Rein<span className="text-highlight">Plan</span>
      </span>
    </>
  );
  const wrapper = cn('flex min-w-0 items-center gap-2.5', className);
  return href ? (
    <Link href={href} className={wrapper} aria-label="ReinPlan">
      {content}
    </Link>
  ) : (
    <span className={wrapper}>{content}</span>
  );
}

/** Product wordmark for unauthenticated screens, where no tenant is known yet. */
export function ProductBrand({ className }: { className?: string }) {
  return (
    <span className={cn('text-lg font-semibold tracking-tight', className)}>
      Rein<span className="text-primary">Plan</span>
    </span>
  );
}
