/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  async headers() {
    const isProd = process.env.NODE_ENV === 'production';
    // img-src 白名单：生产从 CSP_IMG_HOSTS 环境变量读（逗号分隔），
    // 默认含 'self' + data:。避免 admin/staff 写入的任意 https URL 成为跟踪像素 / referer 泄漏入口。
    // dev 仍保留 `https:` 方便接任意 CDN。
    const imgHosts = (process.env.CSP_IMG_HOSTS ?? "'self' data:")
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const imgSrc = isProd ? imgHosts.join(' ') : "'self' data: https:";
    // 生产环境启用 CSP + HSTS。Next.js + Tailwind 需 'unsafe-inline' 兼容；
    // CSP 偏严，下游可按业务调整。
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
};

export default nextConfig;
