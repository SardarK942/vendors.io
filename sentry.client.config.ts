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
    // No Session Replay: `integrations: []` never registers it, so the replay
    // sample rates were dead config that only kept the ~50KB Replay bundle from
    // tree-shaking out. Drop them to shed that weight. Re-add replayIntegration()
    // + the sample rates together if Replay is ever wanted.
    // Don't double-send console.error — structured logger handles that server-side.
    integrations: [],
    // In-app browsers (Instagram/Facebook WebViews) inject a navigation logger
    // that throws when it can't postMessage to the native layer during the
    // OAuth redirect. The redirect still succeeds — this is instrumentation
    // noise from the host app, not a Baazar bug. Drop it so it stops paging us.
    ignoreErrors: [
      /Java exception was raised during method invocation/i,
      /Error invoking postMessage/i,
    ],
  });
}
