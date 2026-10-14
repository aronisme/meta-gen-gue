import type { NextConfig } from "next";

const isExport = process.env.NEXT_EXPORT?.trim() === 'true';

const nextConfig: NextConfig = {
  ...(isExport ? { output: 'export' } : {}),
  ...(isExport
    ? {}
    : {
        async headers() {
          return [
            {
              source: '/:path*',
              headers: [
                {
                  key: 'X-Frame-Options',
                  value: 'DENY',
                },
                {
                  key: 'X-Content-Type-Options',
                  value: 'nosniff',
                },
                {
                  key: 'Referrer-Policy',
                  value: 'strict-origin-when-cross-origin',
                },
                {
                  key: 'X-XSS-Protection',
                  value: '1; mode=block',
                },
                {
                  key: 'Permissions-Policy',
                  value: 'camera=(), microphone=(), geolocation=()',
                },
              ],
            },
          ];
        },
      }),
  images: {
    unoptimized: true, // Using data URLs for thumbnails
  },
};

export default nextConfig;
