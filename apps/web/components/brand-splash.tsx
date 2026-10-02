import { BrandBackdrop } from '@/components/brand-backdrop';
import { ProductBrand } from '@/components/company-brand';
import { brandImage } from '@/lib/brand-assets';

/**
 * The screen between pressing a link and the session being known.
 *
 * It is shown by Next while the root segment streams — never on a timer. There
 * is no minimum display time and nothing is delayed to make room for it: if the
 * session resolves in 80 ms this is never painted, which is the correct
 * outcome. A splash that insists on being seen is a splash that costs everyone
 * a second, every time.
 *
 * It belongs to the same family as the sign-in screens — same backdrop, same
 * veil, same mark — so the hand-off between them has no flash of a different
 * product.
 */
export function BrandSplash({ message }: { message: string }) {
  return (
    <main
      role="status"
      aria-busy="true"
      className="relative isolate grid min-h-[100dvh] place-items-center overflow-hidden bg-ink px-6 text-center"
    >
      <BrandBackdrop photo={brandImage.loadingBackdrop} weight="centre" />

      <div className="animate-rise-in">
        <ProductBrand className="justify-center text-[1.4rem] text-white [&_span]:text-highlight" />

        {/* A bar that fills and restarts, rather than a spinner: it says the
            application is coming without pretending to know how far along it
            is. Static for anybody who has asked for less motion. */}
        <div className="mx-auto mt-8 h-[3px] w-44 overflow-hidden rounded-full bg-white/12">
          <div className="h-full w-1/3 rounded-full bg-highlight motion-safe:animate-loading-sweep motion-reduce:w-full motion-reduce:opacity-60" />
        </div>

        <p className="mt-6 text-sm text-white/60">{message}</p>
      </div>
    </main>
  );
}
