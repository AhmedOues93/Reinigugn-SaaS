import Image from 'next/image';
import { cn } from '@reinigung/ui';
import type { BrandPhoto } from '@/lib/brand-assets';

/**
 * The photograph behind a signed-out screen, and the veil over it.
 *
 * Both halves belong together, which is why they are one component. A
 * photograph placed without the veil is a contrast bug waiting to ship: the
 * copy over it is white, and white on the lit part of an office photograph
 * fails at any size.
 *
 * `weight` says which veil, and it follows the layout rather than the device.
 * The two-column sign-in needs the frame darkest on the side the headline sits
 * on; a single centred column needs it darkest top and bottom, where the logo
 * and the legal line go.
 *
 * Art direction is real: when a portrait crop exists it is served to
 * phone-shaped viewports through `<picture>`, because a landscape frame cropped
 * to 9:16 keeps whatever happens to be in its middle. Until the licensed
 * photograph lands, `brandImage` carries a placeholder and this renders a plain
 * brand field — see `docs/brand-assets.md`.
 */
export function BrandBackdrop({
  photo,
  weight = 'side',
  className,
}: {
  photo: BrandPhoto;
  weight?: 'side' | 'centre';
  className?: string;
}) {
  const hasSources = Boolean(photo.avif || photo.webp || photo.portrait);

  return (
    <div
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-0 -z-10 overflow-hidden',
        weight === 'centre' ? 'photo-veil photo-veil-center' : 'photo-veil',
        className,
      )}
    >
      {hasSources ? (
        /*
          A plain <picture>, not next/image: the point here is choosing between
          an art-directed portrait crop and a landscape one, which is a job for
          media queries rather than for a resizing proxy. The file is already
          the right size, and there is exactly one of it per viewport shape.
        */
        <picture>
          {photo.portrait?.avif && (
            <source media="(max-aspect-ratio: 3/4)" srcSet={photo.portrait.avif} type="image/avif" />
          )}
          {photo.portrait?.webp && (
            <source media="(max-aspect-ratio: 3/4)" srcSet={photo.portrait.webp} type="image/webp" />
          )}
          {photo.portrait && (
            <source media="(max-aspect-ratio: 3/4)" srcSet={photo.portrait.fallback} />
          )}
          {photo.avif && <source srcSet={photo.avif} type="image/avif" />}
          {photo.webp && <source srcSet={photo.webp} type="image/webp" />}
          <img
            src={photo.fallback}
            alt=""
            width={photo.width}
            height={photo.height}
            fetchPriority="high"
            decoding="async"
            className="size-full object-cover"
          />
        </picture>
      ) : (
        <Image
          src={photo.fallback}
          alt=""
          width={photo.width}
          height={photo.height}
          // Nothing is gained by preloading a stand-in ahead of the form.
          priority={!photo.isPlaceholder}
          className="size-full object-cover"
        />
      )}
    </div>
  );
}
