# Brand imagery

What the application ships today, and what still has to be commissioned.

## How imagery is wired

Every brand image is referenced through one module, `apps/web/lib/brand-assets.ts`:

```ts
export const brandImage = {
  authBackdrop: placeholder,      // office + portal sign-in
  employeeBackdrop: placeholder,  // employee sign-in
  loadingBackdrop: placeholder,   // branded session-loading screen
  dashboardHero: placeholder,     // dashboard call-to-action card
};
```

Each entry is a `BrandPhoto`: a landscape `fallback`, optional `avif`/`webp`
encodings, an optional art-directed `portrait` crop in the same three formats,
and `isPlaceholder`. `BrandBackdrop` renders it — a `<picture>` that serves the
portrait crop below a 3:4 aspect ratio and prefers AVIF, then WebP — together
with the veil that keeps white text legible over it.

Three rules hold across the product:

- **Nothing is hotlinked.** Every asset is served from `public/`. A sign-in page
  that waits on somebody else's CDN is a sign-in page that fails when they do,
  and an image loaded from a third party can be changed without us knowing.
- **Every image declares its intrinsic size**, so the space is reserved before
  the file arrives and the layout never jumps.
- **The veil is not optional.** `.photo-veil` (and `.photo-veil-center` on
  phone-shaped screens) is what guarantees white text clears WCAG AA over *any*
  part of the frame. A new photograph must keep the veil, not replace it with
  its own darkening.

## What ships today

`public/brand/backdrop-placeholder.svg` — **a plain field in the brand's
Tiefsee, and nothing else**.

An earlier revision drew an office lobby in SVG: a lit corridor, glazed walls, a
trolley silhouette. It was dropped on purpose. Illustrated architecture that is
almost convincing is worse than an empty frame, because it reads as a finished
decision and nobody replaces it. The frame is deliberately blank so that it is
obvious the photograph has not arrived.

**This environment cannot fetch one.** The network policy denies the stock
libraries at the proxy, so no licensed image can be downloaded and committed
from here. The asset below has to be supplied.

## What still has to be commissioned

One photograph, or a small set sharing one look:

| | |
| --- | --- |
| **Subject** | A modern office building or lobby, after hours, with cleaning work visibly in progress |
| **Mood** | Deep blue-petrol, low key, artificial interior light; calm, not dramatic |
| **Content** | Subtle equipment — a trolley, a machine, a warning sign. **No** posed workers looking at camera |
| **Composition** | Quiet left third and quiet right third: the headline sits on one, the sign-in card on the other. The interest belongs in the middle |
| **Aspect** | 16:10, delivered at 2560 × 1600 or larger |
| **Format** | AVIF plus a WebP fallback; under 250 kB each after optimisation |
| **Rights** | Licensed for commercial web use, perpetual, no attribution in the UI |

A second, portrait-cropped frame (4:5 or 9:16) for the employee sign-in would
improve the phone experience, where the landscape frame currently crops to its
centre. It is a nice-to-have, not a blocker.

## Swapping the placeholder

1. Put the files in `apps/web/public/brand/` — AVIF and WebP for each of the
   landscape and portrait crops, plus one JPEG fallback each.
2. Replace the `placeholder` constant in `lib/brand-assets.ts` with the real
   entry, and set `isPlaceholder: false`:

   ```ts
   const lobby: BrandPhoto = {
     fallback: '/brand/lobby.jpg',
     avif: '/brand/lobby.avif',
     webp: '/brand/lobby.webp',
     portrait: {
       fallback: '/brand/lobby-portrait.jpg',
       avif: '/brand/lobby-portrait.avif',
       webp: '/brand/lobby-portrait.webp',
     },
     width: 2560,
     height: 1600,
     isPlaceholder: false,
   };
   ```

3. Check contrast on the sign-in screen at 1440 × 900 and at 390 × 844. If any
   text falls below 4.5:1, deepen `.photo-veil` in `globals.css` — never lighten
   the text.

No component changes are needed: `BrandBackdrop` already emits the `<picture>`,
picks the portrait crop below a 3:4 aspect ratio, and preloads the landscape
frame once `isPlaceholder` is false.

The logo and colour used in the navigation are separate and come from company
branding in the database, not from this module.
