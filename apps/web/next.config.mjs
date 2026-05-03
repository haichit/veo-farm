/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@veo-farm/shared'],
  // Standalone output → produces .next/standalone/server.js that the Electron
  // main process spawns at runtime. No `next start` needed in the packaged app.
  output: 'standalone',
  // Lint runs in CI/dev — don't block production build on stale eslint rules.
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    serverActions: { allowedOrigins: ['localhost:3000', 'localhost:*'] },
  },
};

export default nextConfig;
