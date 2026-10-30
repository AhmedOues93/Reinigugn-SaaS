import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /*
   * Schrift und Farbprofil der Rechnungs-PDF liegen als Dateien im Projekt
   * und werden zur Laufzeit gelesen, nicht gebuendelt. Ohne diese Zeile
   * fehlen sie in einem `standalone`-Build -- und ohne eingebettete Schrift
   * waere das Ergebnis kein PDF/A-3 und damit kein gueltiges ZUGFeRD.
   */
  outputFileTracingIncludes: {
    '/dashboard/abrechnung/**': ['./lib/billing/assets/*'],
    '/portal/rechnungen/**': ['./lib/billing/assets/*'],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '12mb',
    },
  },
  transpilePackages: ['@reinigung/ui', '@reinigung/types', '@reinigung/validation', '@reinigung/config'],
  async redirects() {
    return [
      // The employee area moved out of the dashboard shell into the mobile app.
      // One employee surface, not two — old links keep working.
      { source: '/dashboard/mein-bereich', destination: '/mitarbeiter', permanent: true },
      { source: '/dashboard/mein-bereich/:id', destination: '/mitarbeiter/einsaetze/:id', permanent: true },
    ];
  },
};

export default nextConfig;
