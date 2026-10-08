# Brand imagery

The production photographic assets shipped with the application.

## How imagery is wired

Every brand image is referenced through one module, `apps/web/lib/brand-assets.ts`:

```ts
export const brandImage = {
  authBackdrop: lobby,            // office + portal sign-in
  employeeBackdrop: lobby,        // employee sign-in
  loadingBackdrop: lobby,         // branded session-loading screen
  dashboardHero,                  // dashboard call-to-action card
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

## Assets in use

| Asset | Dimensions | Purpose |
| --- | --- | --- |
| `lobby.{avif,webp,jpg}` | 1586 × 992 | Desktop office, portal and employee login background |
| `lobby-portrait.{avif,webp,jpg}` | 941 × 1672 | Art-directed mobile login background |
| `dashboard-hero.{avif,webp,jpg}` | 1586 × 992 | Dashboard quick-action hero |

All are photorealistic architectural scenes generated for SauberWerk: a premium
commercial office, restrained cleaning context, and dark petrol/navy grading.
`BrandBackdrop` emits a `<picture>`, selects the portrait image below a 3:4
aspect ratio, then prefers AVIF, WebP and JPEG. The contrast veil remains part
of the composition and must be kept when the photos are changed.

The logo and colour used in the navigation are separate and come from company
branding in the database, not from this module.
