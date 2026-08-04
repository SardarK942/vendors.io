/**
 * Upstash-backed cache for hybrid search results. Dormant until
 * UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set — without them,
 * get/set are no-ops and every search round-trips to OpenAI + pgvector.
 *
 * Why cache: parseSearchQuery + generateEmbedding cost ~$0.00017 per call AND
 * add ~500ms latency. Common queries ("cultural wedding photographer") hit
 * the same parse → same embedding → same vendor set. 1h TTL.
 */

import { Redis } from '@upstash/redis';
import { createHash } from 'node:crypto';

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;

const TTL_SECONDS = 60 * 60; // 1 hour

function key(query: string): string {
  const h = createHash('sha1').update(query.toLowerCase().trim()).digest('hex');
  return `ai-search:v1:${h}`;
}

export async function getCached<T>(query: string): Promise<T | null> {
  if (!redis) return null;
  try {
    const raw = await redis.get<T>(key(query));
    return raw ?? null;
  } catch (err) {
    console.error('[search-cache] get error', err);
    return null;
  }
}

export async function setCached<T>(query: string, value: T): Promise<void> {
  if (!redis) return;
  try {
    await redis.set(key(query), value, { ex: TTL_SECONDS });
  } catch (err) {
    console.error('[search-cache] set error', err);
  }
}
