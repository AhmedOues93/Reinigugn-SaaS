import Image from 'next/image';
import { cn } from '@reinigung/ui';

/** Initials are the fallback: always something recognisable, never a broken image. */
export function initialsOf(firstName?: string | null, lastName?: string | null, fallback?: string | null) {
  const letters = [firstName, lastName]
    .map((part) => part?.trim()?.[0] ?? '')
    .join('')
    .toUpperCase();
  if (letters) return letters;
  return (fallback?.trim()?.[0] ?? '?').toUpperCase();
}

export function Avatar({
  url,
  initials,
  size = 56,
  className,
}: {
  url: string | null;
  initials: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-soft font-semibold text-primary',
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size / 2.6) }}
      aria-hidden="true"
    >
      {url ? (
        <Image src={url} alt="" width={size} height={size} className="size-full object-cover" unoptimized />
      ) : (
        initials
      )}
    </span>
  );
}
