import { NextResponse } from 'next/server';

/**
 * Installability for the office app.
 *
 * A second manifest on the same origin, not a second copy of the first: its
 * `scope` and `id` are `/dashboard`, so a browser installs whichever app the
 * visitor is actually in and keeps the two as separate entries. Sharing one
 * manifest would mean office staff and cleaners end up with the same tile
 * pointing at the same surface, which is precisely what this avoids.
 *
 * The office carries Tiefsee, the colour of its own navigation rail; the field
 * app carries Smaragd. Same leaf, two unmistakable tiles.
 */
export function GET() {
  return NextResponse.json(
    {
      id: '/dashboard',
      name: 'ReinPlan Büro',
      short_name: 'ReinPlan',
      description: 'Aufträge, Planung, Leistungsnachweise und Abrechnung für das Büro.',
      lang: 'de',
      dir: 'auto',
      start_url: '/dashboard',
      scope: '/dashboard',
      display: 'standalone',
      background_color: '#F4F7F8',
      theme_color: '#0F1F21',
      categories: ['business', 'productivity'],
      icons: [
        { src: '/icons/admin-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        { src: '/icons/admin-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/admin-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icons/admin-icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    { headers: { 'content-type': 'application/manifest+json', 'cache-control': 'public, max-age=3600' } },
  );
}
