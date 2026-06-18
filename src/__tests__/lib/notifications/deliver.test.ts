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

  it('returns null on error and logs structured failure', async () => {
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
      expect.objectContaining({
        kind: 'email',
        error: 'rls denied',
        context: { booking_id: 'b_1' },
      })
    );
  });

  it('handles non-Error throws without crashing', async () => {
    const result = await deliver('notify', async () => {
      throw 'string-error';
    });
    expect(result).toBeNull();
    expect(logger.error).toHaveBeenCalledWith(
      'delivery_failure',
      expect.objectContaining({
        kind: 'notify',
        error: 'string-error',
      })
    );
  });
});
