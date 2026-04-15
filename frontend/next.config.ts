import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  allowedDevOrigins: ['72.60.185.57', '*.72.60.185.57', '72-60-185-57.sslip.io', '*.sslip.io'],
};

export default nextConfig;
