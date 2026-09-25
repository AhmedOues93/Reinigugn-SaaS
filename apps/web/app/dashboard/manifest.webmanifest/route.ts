import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json(
    {
      id: '/dashboard',
      name: 'ReinPlan Admin',
      short_name: 'ReinPlan',
      description: 'Büro, Kunden, Angebote, Planung und Abrechnung für Reinigungsunternehmen.',
      start_url: '/dashboard',
      scope: '/dashboard',
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#f8fafc',
      theme_color: '#0B2A33',
      icons: [
        { src: '/icons/reinplan-admin.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        { src: '/icons/reinplan-admin.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
      ],
    },
    { headers: { 'content-type': 'application/manifest+json', 'cache-control': 'public, max-age=3600' } },
  );
}
