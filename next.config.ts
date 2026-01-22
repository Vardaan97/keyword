import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Increase API body size limit for large CSV imports
  // Note: Vercel has its own limits (4.5MB hobby, higher for pro)
  // For very large files, consider chunked upload approach
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb',
    },
  },
};

export default nextConfig;
