/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      // Marketing entry for the vendor DM outreach campaign. Any URL surfaced
      // in a DM or email that says "start here" should route through this so
      // we can retarget / analytics-track the campaign entry point in one
      // place. Signup page pre-selects the vendor role.
      {
        source: '/join-vendor',
        destination: '/signup?role=vendor',
        permanent: false,
      },
    ];
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
