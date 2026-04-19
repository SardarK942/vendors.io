/** @type {import('next').NextConfig} */
const nextConfig = {};

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
