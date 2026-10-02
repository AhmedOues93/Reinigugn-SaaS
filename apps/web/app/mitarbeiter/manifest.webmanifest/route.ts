import { NextResponse } from 'next/server';

/**
 * Installability for the employee app.
 *
 * The manifest is static and carries no tenant data, so it stays cacheable and
 * never leaks a company name.
 *
 * PNG icons at 192 and 512 are not decoration: Chrome only treats a site as
 * installable when the manifest offers a square PNG of at least 192px, and a
 * manifest listing only SVG is why "Zum Startbildschirm hinzufügen" produced a
 * generic tile instead of the mark. The SVG is kept first for the browsers that
 * prefer it.
 *
 * The field app is Smaragd — the colour that means "this is the action" — so it
 * is told apart from the office app on a home screen at a glance, while both
 * carry the same leaf.
 */
export function GET() {
  return NextResponse.json(
    {
      id: '/mitarbeiter',
      name: 'ReinPlan Mitarbeiter',
      short_name: 'Mitarbeiter',
      description: 'Einsätze, Zeiterfassung und Nachweise für Reinigungskräfte.',
      lang: 'de',
      dir: 'auto',
      start_url: '/mitarbeiter',
      scope: '/mitarbeiter',
      display: 'standalone',
      orientation: 'portrait',
      /* Nebel and Smaragd, the same tokens the app itself is built from. */
      background_color: '#F4F7F8',
      theme_color: '#05785A',
      categories: ['business', 'productivity'],
      icons: [
        { src: '/icons/employee-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        { src: '/icons/employee-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/employee-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icons/employee-icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    { headers: { 'content-type': 'application/manifest+json', 'cache-control': 'public, max-age=3600' } },
  );
}
