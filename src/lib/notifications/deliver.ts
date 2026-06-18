import { logger } from '@/lib/logger';

export type DeliverKind = 'notify' | 'email';

/**
 * Wraps a notify or email send so the caller never has to remember to
 * .catch(). Failures log structured errors and resolve to null. The
 * surrounding business logic stays succeeding.
 */
export async function deliver<T>(
  kind: DeliverKind,
  fn: () => Promise<T>,
  context?: Record<string, unknown>
): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    logger.error('delivery_failure', {
      kind,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      context,
    });
    return null;
  }
}
