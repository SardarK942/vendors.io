/**
 * Structured logger. Writes to console today. When Sentry lands in Phase H,
 * swap the transport without touching call sites.
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
}

export const logger = {
  info: (message: string, context?: LogContext) => emit('info', message, context),
  warn: (message: string, context?: LogContext) => emit('warn', message, context),
  error: (message: string, error?: unknown, context?: LogContext) =>
    emit('error', message, context, error),
};
