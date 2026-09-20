/**
 * The photographic backdrop behind every signed-out screen.
 *
 * One module, so swapping the placeholder for the licensed photograph is a
 * single edit rather than a search across five screens. Every value is a path
 * under `public/`: nothing is fetched from a third party, so no sign-in screen
 * waits on somebody else's CDN and no image can be swapped out from under us.
 *
 * The shape below is built for a real photograph — modern formats first and
 * an art-directed portrait crop for phones. The assets live with the app so
 * authentication never depends on a third-party image host.
 */

export type BrandPhoto = {
  /** Landscape frame. The only required entry. */
  fallback: string;
  /** Modern encodings of the same landscape frame, offered first. */
  avif?: string;
  webp?: string;
  /** A separate crop for phone-shaped viewports, in the same three formats. */
  portrait?: { fallback: string; avif?: string; webp?: string };
  /** Intrinsic size of `fallback`, so the space is reserved before it loads. */
  width: number;
  height: number;
  /**
   * True while the committed file is a stand-in. Read by `BrandBackdrop`,
   * which then skips `priority` — there is no point preloading a placeholder —
   * and warns once in development.
   */
  isPlaceholder: boolean;
};

const lobby: BrandPhoto = {
  fallback: '/brand/lobby.jpg',
  avif: '/brand/lobby.avif',
  webp: '/brand/lobby.webp',
  portrait: {
    fallback: '/brand/lobby-portrait.jpg',
    avif: '/brand/lobby-portrait.avif',
    webp: '/brand/lobby-portrait.webp',
  },
  width: 1586,
  height: 992,
  isPlaceholder: false,
};

const dashboardHero: BrandPhoto = {
  fallback: '/brand/dashboard-hero.jpg',
  avif: '/brand/dashboard-hero.avif',
  webp: '/brand/dashboard-hero.webp',
  width: 1586,
  height: 992,
  isPlaceholder: false,
};

/**
 * All four signed-out surfaces share one frame today. They are listed
 * separately because they will not always: the employee sign-in wants a
 * portrait crop, and the dashboard card wants a tighter one.
 */
export const brandImage = {
  /** Office and portal sign-in. */
  authBackdrop: lobby,
  /** Employee sign-in, opened on a phone far more often than on a desk. */
  employeeBackdrop: lobby,
  /** The branded loading screen shown while a session resolves. */
  loadingBackdrop: lobby,
  /** The dashboard's call-to-action card. */
  dashboardHero,
} as const;
