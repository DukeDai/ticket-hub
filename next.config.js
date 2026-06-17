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
    // img-src 白名单：生产从 CSP_IMG_HOSTS 环境变量读（逗号分隔），多个 host 包含完整 origin。
    // 默认含 'self' + data: + https:，覆盖大多数部署（Vercel、CDN、S3、对象存储等）。
    // 生产默认值改动（C8 修复）：从 `'self' data:` 放宽到 `'self' data: https:`，
    // 避免无 CSP_IMG_HOSTS 配置时所有 https:// 图片被 CSP 拦截。
    // 如需更严的 prod 白名单，在 .env 中显式设置 CSP_IMG_HOSTS（逗号分隔 origin 列表）。
    const imgHosts = (process.env.CSP_IMG_HOSTS ?? "'self' data: https:")
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
