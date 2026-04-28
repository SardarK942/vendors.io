// Next.js instrumentation hook. Runs once on server start, before any request
// is handled. @sentry/nextjs v8+ requires this file to actually initialize the
// server SDK — without it, sentry.server.config.ts is dead weight and no
// captureException call from a route handler ever reaches Sentry.

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}
