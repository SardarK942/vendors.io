/**
 * Rate limiting via Upstash Redis. Dormant until UPSTASH_REDIS_REST_URL +
 * UPSTASH_REDIS_REST_TOKEN are set — without them, checkRateLimit is a no-op.
 *
 * Why Upstash: Vercel's serverless functions run on many instances, so an
 * in-memory Map-based limiter would let abusers bypass it by hitting different
 * instances. Upstash is the only Redis that works without connection pooling
 * and fits the serverless model.
 *
 * Usage:
 *   const gate = await checkRateLimit(request, 'booking:create', { limit: 5, window: '1 m' });
 *   if (!gate.ok) throw new HttpError(429, gate.message);
 *
 * Identifier precedence: explicit userId > x-forwarded-for IP > 'anonymous'.
 */

import type { NextRequest } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

type Window = `${number} ${'s' | 'm' | 'h'}`;

export interface RateLimitOptions {
  limit: number;
  window: Window;
}

export interface RateLimitResult {
  ok: boolean;
  message?: string;
  remaining?: number;
  resetAt?: number;
}

let redis: Redis | null = null;
const limiters = new Map<string, Ratelimit>();

function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

function getLimiter(key: string, options: RateLimitOptions): Ratelimit | null {
  const client = getRedis();
  if (!client) return null;
  const cacheKey = `${key}:${options.limit}:${options.window}`;
  let limiter = limiters.get(cacheKey);
  if (!limiter) {
    limiter = new Ratelimit({
      redis: client,
      limiter: Ratelimit.slidingWindow(options.limit, options.window),
      prefix: `rl:${key}`,
      analytics: false,
    });
    limiters.set(cacheKey, limiter);
  }
  return limiter;
}

function identifierFrom(request: NextRequest, userId?: string): string {
  if (userId) return `u:${userId}`;
  const xff = request.headers.get('x-forwarded-for');
  const ip = xff?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'anonymous';
  return `ip:${ip}`;
}

/**
 * Check whether a request is within the rate-limit budget. When Upstash env
 * vars aren't set, always returns ok=true (no-op mode). Never throws — rate
 * limiter failures should degrade to "allow" rather than take the site down.
 */
export async function checkRateLimit(
  request: NextRequest,
  key: string,
  options: RateLimitOptions,
  userId?: string
): Promise<RateLimitResult> {
  const limiter = getLimiter(key, options);
  if (!limiter) return { ok: true };

  try {
    const identifier = identifierFrom(request, userId);
    const result = await limiter.limit(identifier);
    if (result.success) {
      return { ok: true, remaining: result.remaining, resetAt: result.reset };
    }
    return {
      ok: false,
      message: `Too many requests. Try again in ${Math.max(
        1,
        Math.ceil((result.reset - Date.now()) / 1000)
      )}s.`,
      remaining: 0,
      resetAt: result.reset,
    };
  } catch (err) {
    // Rate limiter down → allow (fail-open). We still log for visibility.
    console.error('[rate-limit] check failed', err);
    return { ok: true };
  }
}
