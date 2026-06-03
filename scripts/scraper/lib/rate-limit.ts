export interface RateLimiter {
  acquire(): Promise<void>;
}

export interface RateLimiterOptions {
  qps: number; // sustained queries per second
  burst: number; // initial burst budget
  jitterMs?: number; // random delay added to each acquire (0–jitterMs)
}

export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  const intervalMs = 1000 / opts.qps;
  let nextSlot: number | null = null;
  let bursts = opts.burst;
  const jitter = opts.jitterMs ?? 0;

  return {
    async acquire() {
      const now = Date.now();
      if (bursts > 0) {
        bursts--;
        // Initialize nextSlot when burst runs out
        if (nextSlot === null) {
          nextSlot = now + intervalMs;
        }
        if (jitter) await sleep(Math.random() * jitter);
        return;
      }
      if (nextSlot === null) {
        nextSlot = now + intervalMs;
      }
      const wait = Math.max(0, nextSlot - now);
      nextSlot += intervalMs;
      await sleep(wait + Math.random() * jitter);
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
