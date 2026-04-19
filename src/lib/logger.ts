/**
 * Structured logger. Writes JSON-per-line to stdout/stderr. When SENTRY_DSN is
 * configured, logger.error also forwards to Sentry via captureException. No-op
 * for Sentry when DSN is unset, so local dev + unwired previews stay quiet.
 *
 * Usage:
 *   import { logger } from '@/lib/logger';
 *   logger.info('deposit succeeded', { bookingId, amount });
 *   logger.error('transfer failed', err, { txId });
 */

export type LogContext = Record<string, unknown>;

type Level = 'info' | 'warn' | 'error';

function emit(level: Level, message: string, context?: LogContext, error?: unknown) {
  const entry: Record<string, unknown> = {
    level,
    ts: new Date().toISOString(),
    message,
    ...context,
  };

  if (error) {
    entry.error = error instanceof Error ? { message: error.message, stack: error.stack } : error;
  }

  const line = JSON.stringify(entry);

  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);

  if (level === 'error' && (process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN)) {
    // Dynamic import: don't load @sentry/nextjs if DSN isn't set. The dynamic
    // import is intentionally fire-and-forget; a failed capture must never
    // mask or delay the original error's handling.
    import('@sentry/nextjs')
      .then((Sentry) => {
        if (error instanceof Error) {
          Sentry.captureException(error, { extra: { message, ...context } });
        } else {
          Sentry.captureMessage(message, { level: 'error', extra: { error, ...context } });
        }
      })
      .catch(() => {
        /* swallow — primary logging already happened above */
      });
  }
}

export const logger = {
  info: (message: string, context?: LogContext) => emit('info', message, context),
  warn: (message: string, context?: LogContext) => emit('warn', message, context),
  error: (message: string, error?: unknown, context?: LogContext) =>
    emit('error', message, context, error),
};
