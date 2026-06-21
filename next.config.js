import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/lib/i18n/request-config.ts');

/** @type {import('next').NextConfig} */
const nextConfig = withNextIntl({
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  async headers() {
    const isProd = process.env.NODE_ENV === 'production';
    const imgHosts = (process.env.CSP_IMG_HOSTS ?? "'self' data: https:")
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const imgSrc = isProd ? imgHosts.join(' ') : "'self' data: https:";
    const prodSecurityHeaders = isProd
      ? [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              `img-src ${imgSrc}`,
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "connect-src 'self' https:",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "object-src 'none'",
            ].join('; '),
          },
        ]
      : [];
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          ...prodSecurityHeaders,
        ],
      },
    ];
  },
});

export default nextConfig;
