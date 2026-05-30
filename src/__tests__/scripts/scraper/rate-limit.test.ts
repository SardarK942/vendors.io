import { describe, expect, it } from 'vitest';
import { createRateLimiter } from '../../../../scripts/scraper/lib/rate-limit';

describe('createRateLimiter', () => {
  it('allows N calls within the burst budget without delay', async () => {
    const limiter = createRateLimiter({ qps: 10, burst: 5, jitterMs: 0 });
    const start = Date.now();
    for (let i = 0; i < 5; i++) await limiter.acquire();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  it('throttles to ~qps after burst is exhausted', async () => {
    const limiter = createRateLimiter({ qps: 10, burst: 1, jitterMs: 0 });
    const start = Date.now();
    // 1 burst + 2 throttled @ 10 QPS = ~200ms
    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(180);
    expect(elapsed).toBeLessThanOrEqual(350);
  });
});
