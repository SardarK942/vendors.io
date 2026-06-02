import { createHash } from 'node:crypto';
import { createServiceRoleClient } from '@/lib/supabase/server';

export type EngagementEvent = 'view' | 'ig_click';

/** Hash IP + UA + UTC-day for k-anonymous dedup. Mirrors the pattern in
 *  src/lib/analytics/ip-hash.ts (IP + day) with UA also folded in to keep
 *  shared-IP-different-browser visits separate. */
function computeEngagementHash(ip: string, userAgent: string, now: Date = new Date()): string {
  const day = now.toISOString().slice(0, 10);
  return createHash('sha256').update(`${ip}::${userAgent}::${day}`).digest('hex');
}

/** Insert an engagement event. The (vendor, event_type, ip_hash, day) unique
 *  index causes duplicates to be silently ignored at insert. */
export async function logEngagement(
  scrapedVendorId: string,
  event: EngagementEvent,
  ip: string,
  userAgent: string
): Promise<void> {
  const supabase = await createServiceRoleClient();
  const ipHash = computeEngagementHash(ip, userAgent);
  // Postgres unique violation (23505) when row already exists for this day:
  // ignore it; that's the dedup mechanism.
  const { error } = await supabase.from('scraped_vendor_engagement').insert({
    scraped_vendor_id: scrapedVendorId,
    event_type: event,
    ip_hash: ipHash,
  });
  if (error && error.code !== '23505') {
    // Real error — log but don't throw. Engagement is fire-and-forget.
    console.warn('logEngagement failed:', error.message);
  }
}
