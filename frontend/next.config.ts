import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  allowedDevOrigins: ['72.60.185.57', '*.72.60.185.57', '72-60-185-57.sslip.io', '*.sslip.io'],
  async rewrites() {
    return [
      {
        source: '/api/settings/:path*',
        destination: 'http://backend:3011/api/settings/:path*',
      },
      {
        source: '/api/bugs/:path*',
        destination: 'http://backend:3011/api/bugs/:path*',
      },
      {
        source: '/api/generate/:path*',
        destination: 'http://backend:3011/api/generate/:path*',
      },
      {
        source: '/api/project/:path*',
        destination: 'http://host.docker.internal:8080/api/project/:path*',
      },
    ];
  },
};

export default nextConfig;
