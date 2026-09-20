import { cn } from '@reinigung/ui';

/**
 * The SauberWerk mark: a leaf inside a rounded square.
 *
 * A leaf because this trade sells a result people describe as "fresh" rather
 * than a machine, and because it survives being 24px in a browser tab. Drawn
 * inline rather than fetched, so it is never the reason a sign-in screen has
 * an empty box in the corner for 200 ms.
 *
 * It takes its colour from the text colour of whatever it sits in.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn('shrink-0', className)} role="img" aria-label="SauberWerk">
      <rect x="1.25" y="1.25" width="37.5" height="37.5" rx="11" fill="none" stroke="currentColor" strokeWidth="2.5" />
      {/* The leaf: one arc out, one arc back, with the midrib between them. */}
      <path
        d="M12 28c0-8.5 6.4-15 16-15.6-.5 9.6-7 16-15.6 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12.6 28.2 28 12.6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
