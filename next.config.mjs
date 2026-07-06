/** @type {import('next').NextConfig} */
const nextConfig = {};
// NOTE: /join-vendor is implemented as a page-based redirect at
// src/app/join-vendor/page.tsx, not a next.config redirects() entry. The
// config-based path shipped in PR #105 silently no-op'd on prod (verified
// 404). Page-based server redirects are more robust — they run at request
// time and can't be dropped by the Sentry config wrap or Vercel's build cache.

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
