'use server';

import { headers } from 'next/headers';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { computeIpHash } from '@/lib/analytics/ip-hash';

/**
 * Fire-and-forget view tracking, invoked from the marketplace vendor page
 * (Server Component). Skipped when the viewer is the vendor themselves.
 * Dedupes per (vendor, ip_hash, UTC day) via the unique index on
 * vendor_profile_views. Errors are swallowed (logged but never block render).
 */
export async function recordVendorProfileView(
  vendorProfileId: string,
  vendorUserId: string | null
): Promise<void> {
  try {
    const supabase = await createServerSupabaseClient();
    const h = await headers();
    const ip = (h.get('x-forwarded-for') ?? '0.0.0.0').split(',')[0].trim();
    const userAgent = h.get('user-agent') ?? null;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user && vendorUserId && user.id === vendorUserId) return; // own profile

    await supabase.from('vendor_profile_views').insert({
      vendor_profile_id: vendorProfileId,
      viewer_user_id: user?.id ?? null,
      ip_hash: computeIpHash(ip),
      user_agent: userAgent?.slice(0, 500) ?? null,
    });
    // Unique-violation on (vendor, ip_hash, day) is expected for repeat views;
    // PostgREST surfaces it as a non-throwing error which we ignore.
  } catch (err) {
    console.warn('[analytics] recordVendorProfileView failed', err);
  }
}
