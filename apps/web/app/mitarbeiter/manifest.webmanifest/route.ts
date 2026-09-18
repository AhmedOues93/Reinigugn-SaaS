import { NextResponse } from 'next/server';

/**
 * Installability for the employee app. The manifest is static and carries no
 * tenant data, so it stays cacheable and never leaks a company name.
 */
export function GET() {
  return NextResponse.json(
    {
      name: 'SauberWerk Mitarbeiter',
      short_name: 'SauberWerk',
      description: 'Einsätze, Zeiterfassung und Nachweise für Reinigungskräfte.',
      start_url: '/mitarbeiter',
      scope: '/mitarbeiter',
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#f8fafc',
      theme_color: '#0f766e',
      icons: [
        { src: '/icons/app-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        { src: '/icons/app-icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
      ],
    },
    { headers: { 'content-type': 'application/manifest+json', 'cache-control': 'public, max-age=3600' } },
  );
}
