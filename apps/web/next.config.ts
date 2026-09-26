import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
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
