import { cn } from '@reinigung/ui';

/** ReinPlan product mark shared by landing, authentication and the web SaaS. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn('shrink-0', className)} role="img" aria-label="ReinPlan">
      <rect x="1" y="1" width="38" height="38" rx="10" fill="#0b2a33" />
      <path d="M7 18.2 20 7l13 11.2v4.5h-4v-2.4L20 12.5l-9 7.8v2.4H7z" fill="#f8fbff" />
      <rect x="16" y="15.4" width="8" height="6.8" rx="1" fill="#19a9d8" />
      <path d="M20 15.4v6.8M16 18.8h8" stroke="#fff" strokeWidth="0.9" />
      <path d="M3.8 27.4c7-3.8 12.3-4 17-.9 4.9 3.2 9.7 2.7 15.7-.7V39H3.8z" fill="#18a7d7" />
      <path d="M3.8 32c6.8-3.1 12.2-3 16.8-.6 5.2 2.7 10 2.3 15.9-.3V39H3.8z" fill="#124d9b" />
      <path d="M27.4 9.5c-.7-2.7.8-5.1 4-6 .6 3.1-.6 5.3-4 6zm-1.5.2c-2.6-.7-4.1-2.8-3.8-5.8 3 .5 4.5 2.5 3.8 5.8z" fill="#43c96b" />
    </svg>
  );
}
