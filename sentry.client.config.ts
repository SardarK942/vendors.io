// Client-side Sentry init. Runs in browser bundles.
// Dormant by design: when NEXT_PUBLIC_SENTRY_DSN is unset (local dev, preview
// without the env var), Sentry.init is not called and the SDK becomes a no-op.

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || 'development',
    tracesSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0,
    // Don't double-send console.error — structured logger handles that server-side.
    integrations: [],
  });
}
