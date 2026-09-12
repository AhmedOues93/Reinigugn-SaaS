import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@reinigung/ui', '@reinigung/types', '@reinigung/validation', '@reinigung/config'],
};

export default nextConfig;
