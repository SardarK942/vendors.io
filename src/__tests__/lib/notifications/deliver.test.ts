import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deliver } from '@/lib/notifications/deliver';
import { logger } from '@/lib/logger';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

describe('deliver()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the inner result on success', async () => {
    const result = await deliver('notify', async () => ({ id: 'n_1' }));
    expect(result).toEqual({ id: 'n_1' });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('returns null on Error and logs with flat context fields', async () => {
    const err = new Error('rls denied');
    const result = await deliver(
      'email',
      async () => {
        throw err;
      },
      { booking_id: 'b_1' }
    );
    expect(result).toBeNull();
    expect(logger.error).toHaveBeenCalledWith(
      'delivery_failure',
      err,
      expect.objectContaining({
        kind: 'email',
        error_message: 'rls denied',
        booking_id: 'b_1',
      })
    );
  });

  it('handles non-Error throws by passing undefined as error arg', async () => {
    const result = await deliver('notify', async () => {
      throw 'string-error';
    });
    expect(result).toBeNull();
    expect(logger.error).toHaveBeenCalledWith(
      'delivery_failure',
      undefined,
      expect.objectContaining({
        kind: 'notify',
        error_message: 'string-error',
      })
    );
  });
});
