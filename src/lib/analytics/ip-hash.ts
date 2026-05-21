import { createHash } from 'node:crypto';

/**
 * Hash a viewer's IP with a daily-rotating salt for k-anonymous view dedupe.
 * Same IP on the same UTC day → same hash, enabling ON CONFLICT-style dedupe
 * (see migration 00034 vendor_profile_views_dedupe_idx). Different day → new
 * hash, so we can't reconstruct viewing patterns across days.
 *
 * UTC is enforced to match the dedupe index expression
 * (date_trunc('day', viewed_at AT TIME ZONE 'UTC')).
 */
export function computeIpHash(ip: string, now: Date = new Date()): string {
  const day = now.toISOString().slice(0, 10); // YYYY-MM-DD = daily salt
  return createHash('sha256').update(`${ip}::${day}`).digest('hex');
}
