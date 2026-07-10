import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const limitMock = vi.fn();

vi.mock('@upstash/ratelimit', () => {
  class Ratelimit {
    limit = limitMock;
    constructor(_opts: unknown) {}
    static slidingWindow(_limit: number, _window: string) {
      return 'sliding-window-stub';
    }
  }
  return { Ratelimit };
});

vi.mock('@upstash/redis', () => {
  class Redis {
    constructor(_opts: unknown) {}
  }
  return { Redis };
});

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  return {
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    },
  } as unknown as NextRequest;
}

async function importFresh() {
  vi.resetModules();
  return (await import('@/lib/rate-limit')).checkRateLimit;
}

describe('checkRateLimit', () => {
  const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
  const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  beforeEach(() => {
    limitMock.mockReset();
  });

  afterEach(() => {
    if (originalUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = originalUrl;
    if (originalToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = originalToken;
  });

  it('no-ops (returns ok=true) when Upstash env vars are missing', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    const checkRateLimit = await importFresh();

    const result = await checkRateLimit(makeRequest(), 'test:no-op', { limit: 1, window: '1 m' });

    expect(result).toEqual({ ok: true });
    expect(limitMock).not.toHaveBeenCalled();
  });

  it('returns ok=true and remaining when limiter says success', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
    limitMock.mockResolvedValueOnce({ success: true, remaining: 4, reset: 1_700_000_000_000 });
    const checkRateLimit = await importFresh();

    const result = await checkRateLimit(
      makeRequest({ 'x-forwarded-for': '1.2.3.4' }),
      'test:allowed',
      { limit: 5, window: '1 m' }
    );

    expect(result.ok).toBe(true);
    expect(result.remaining).toBe(4);
    expect(limitMock).toHaveBeenCalledWith('ip:1.2.3.4');
  });

  it('returns ok=false with a retry message when limit is exceeded', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
    limitMock.mockResolvedValueOnce({
      success: false,
      remaining: 0,
      reset: Date.now() + 15_000,
    });
    const checkRateLimit = await importFresh();

    const result = await checkRateLimit(
      makeRequest(),
      'test:blocked',
      { limit: 5, window: '1 m' },
      'user-42'
    );

    expect(result.ok).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.message).toMatch(/Too many requests/);
    expect(limitMock).toHaveBeenCalledWith('u:user-42');
  });

  it('prefers explicit userId over IP for the identifier', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
    limitMock.mockResolvedValueOnce({ success: true, remaining: 9, reset: 0 });
    const checkRateLimit = await importFresh();

    await checkRateLimit(
      makeRequest({ 'x-forwarded-for': '9.9.9.9' }),
      'test:id-precedence',
      { limit: 10, window: '1 m' },
      'user-99'
    );

    expect(limitMock).toHaveBeenCalledWith('u:user-99');
  });

  it('falls back to anonymous when no user + no headers are present', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
    limitMock.mockResolvedValueOnce({ success: true, remaining: 30, reset: 0 });
    const checkRateLimit = await importFresh();

    await checkRateLimit(makeRequest(), 'test:anon', { limit: 30, window: '1 m' });

    expect(limitMock).toHaveBeenCalledWith('ip:anonymous');
  });

  it('fails open (ok=true) when the Upstash client throws', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
    limitMock.mockRejectedValueOnce(new Error('upstash offline'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const checkRateLimit = await importFresh();

    const result = await checkRateLimit(
      makeRequest({ 'x-forwarded-for': '1.2.3.4' }),
      'test:fail-open',
      { limit: 5, window: '1 m' }
    );

    expect(result).toEqual({ ok: true });
    expect(consoleSpy).toHaveBeenCalledWith('[rate-limit] check failed', expect.any(Error));
    consoleSpy.mockRestore();
  });
});
