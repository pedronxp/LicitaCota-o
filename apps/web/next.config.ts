import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // O modo standalone usa symlinks que o Windows bloqueia sem Developer Mode.
  // Mantemos standalone no Render/Linux e usamos o build normal localmente.
  output: process.platform === 'win32' ? undefined : 'standalone',
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001',
  },
};

export default nextConfig;
