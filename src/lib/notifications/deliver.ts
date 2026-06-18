import { logger } from '@/lib/logger';

export type DeliverKind = 'notify' | 'email';

export async function deliver<T>(
  kind: DeliverKind,
  fn: () => Promise<T>,
  context?: Record<string, unknown>
): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    logger.error('delivery_failure', err instanceof Error ? err : undefined, {
      kind,
      error_message: err instanceof Error ? err.message : String(err),
      ...(context ?? {}),
    });
    return null;
  }
}
