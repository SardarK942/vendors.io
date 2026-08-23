/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Serve AVIF first (≈20-30% smaller than WebP) with WebP fallback; the
    // optimizer negotiates per-request via the Accept header.
    formats: ['image/avif', 'image/webp'],
    // Vendor photos are content-addressed (UploadThing keys change on replace),
    // so optimized variants can be cached aggressively. Default is 60s.
    minimumCacheTTL: 2678400, // 31 days
    // Explicit allowlist (replaces the former `**` catch-all, which made the
    // optimizer an open image proxy). These are the only hosts that actually
    // feed <Image> in prod — verified 2026-08-23 against portfolio_images +
    // scraped_vendors.photos. Raw <img> paths (scraped/unclaimed cards) are
    // unaffected; they bypass the optimizer entirely.
    remotePatterns: [
      // UploadThing — vendor uploads (dominant source: ~5.6k live)
      { protocol: 'https', hostname: '*.ufs.sh', pathname: '/f/**' },
      { protocol: 'https', hostname: 'utfs.io', pathname: '/f/**' },
      { protocol: 'https', hostname: '*.utfs.io', pathname: '/f/**' },
      // Google Places photo proxy — scraped/curated vendor photos (~5.2k)
      { protocol: 'https', hostname: 'maps.googleapis.com' },
      // Instagram / Facebook CDN — scraped vendor photos + rehost expiry hosts
      // (see scripts/scraper/rehost-photos.ts EXPIRY_HOST_PATTERNS)
      { protocol: 'https', hostname: '*.cdninstagram.com' },
      { protocol: 'https', hostname: '*.fbcdn.net' },
      { protocol: 'https', hostname: 'lookaside.instagram.com' },
    ],
  },
};

// Wrap with Sentry only when the DSN is set. Without the DSN the wrapper still
// injects a client-side shim that tries to hit sentry.io and 404s; skipping it
// keeps local dev + unwired previews silent.
let config = nextConfig;
if (process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN) {
  const { withSentryConfig } = await import('@sentry/nextjs');
  config = withSentryConfig(nextConfig, {
    silent: true,
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    // Source-map upload needs SENTRY_AUTH_TOKEN; skip silently if missing.
    authToken: process.env.SENTRY_AUTH_TOKEN,
    disableLogger: true,
    hideSourceMaps: true,
  });
}

export default config;
