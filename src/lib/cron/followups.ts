// 48-hour follow-up email helpers for the `tick` cron.
//
// Extracted from the cron route so the selection/decision logic is unit-testable
// in isolation. These are a PURE BATCHING refactor of the original inline
// helpers: the same candidates are emailed and the same rows stamped — only the
// per-candidate DB round-trips are collapsed into batched `.in()` queries with
// in-memory grouping.
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  sendCustomer48hFollowupEmail,
  sendVendor48hFollowupEmail,
  type SuggestedVendor,
} from '@/lib/email/resend';
import { getRecentActiveVendors } from '@/services/vendor.service';

type Sb = ReturnType<typeof createServiceRoleClient>;

export async function getRecentActiveVendorsByCategory(supabase: Sb, category: string, limit: number) {
  const { data } = await supabase
    .from('vendor_profiles')
    .select('*')
    .eq('is_active', true)
    .eq('onboarding_complete', true)
    .overlaps('services', [category])
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit);
  return data ?? [];
}

export async function runCustomer48hFollowup(supabase: Sb = createServiceRoleClient()): Promise<void> {
  const now = new Date();
  // 24h-wide window (36h-60h since signup) — sized to overlap with the daily
  // cron schedule regardless of when the user signed up. The followup_48h_sent_at
  // gate prevents double-fires if a user falls into multiple consecutive runs.
  const windowStart = new Date(now.getTime() - 60 * 3600 * 1000).toISOString();
  const windowEnd = new Date(now.getTime() - 36 * 3600 * 1000).toISOString();

  const { data: candidates } = await supabase
    .from('users')
    .select(
      'id, email, full_name, onboarding_data, followup_48h_sent_at, role, onboarding_completed_at'
    )
    .eq('role', 'couple')
    .gte('onboarding_completed_at', windowStart)
    .lte('onboarding_completed_at', windowEnd)
    .is('followup_48h_sent_at', null);

  const candidateList = candidates ?? [];
  if (candidateList.length === 0) return;

  // Batch: one query for the couples that already have ≥1 booking (they get
  // skipped), replacing the per-candidate count query.
  const coupleIds = candidateList.map((u) => u.id);
  const bookedCoupleIds = new Set<string>();
  const { data: bookedRows } = await supabase
    .from('bookings')
    .select('couple_user_id')
    .in('couple_user_id', coupleIds);
  for (const row of bookedRows ?? []) {
    if (row.couple_user_id) bookedCoupleIds.add(row.couple_user_id);
  }

  // Batch: prefetch suggested vendors once per distinct primary category (plus a
  // single no-category fallback), instead of a fresh query per candidate. The
  // per-category result is deterministic, so grouping yields identical lists.
  const primaryCategoryOf = (u: (typeof candidateList)[number]): string | null => {
    const data = (u.onboarding_data ?? {}) as { categories?: string[] | null };
    return data.categories?.[0] ?? null;
  };
  const categories = new Set<string>();
  let needsFallback = false;
  for (const u of candidateList) {
    const c = primaryCategoryOf(u);
    if (c) categories.add(c);
    else needsFallback = true;
  }
  const vendorsByCategory = new Map<string, Awaited<ReturnType<typeof getRecentActiveVendors>>>();
  for (const c of Array.from(categories)) {
    vendorsByCategory.set(c, await getRecentActiveVendorsByCategory(supabase, c, 3));
  }
  const fallbackVendors = needsFallback ? await getRecentActiveVendors(supabase, 3) : [];

  for (const user of candidateList) {
    if (bookedCoupleIds.has(user.id)) continue;

    const data = (user.onboarding_data ?? {}) as {
      event_date?: string | null;
      categories?: string[] | null;
      just_browsing?: boolean | null;
    };
    const hasEvent = !data.just_browsing && !!data.event_date;
    const primaryCategory = data.categories?.[0] ?? null;
    const daysUntilEvent =
      hasEvent && data.event_date
        ? Math.max(0, Math.ceil((new Date(data.event_date).getTime() - now.getTime()) / 86_400_000))
        : null;

    const vendors = primaryCategory
      ? (vendorsByCategory.get(primaryCategory) ?? [])
      : fallbackVendors;

    const suggested: SuggestedVendor[] = vendors.map((v) => ({
      name: v.business_name ?? 'Vendor',
      slug: v.slug ?? '',
      category: v.category ?? 'vendor',
      thumbnail_url:
        Array.isArray(v.portfolio_images) && v.portfolio_images.length > 0
          ? (v.portfolio_images[0] as string)
          : null,
    }));

    const firstName = (user.full_name ?? '').split(' ')[0] || 'there';

    await sendCustomer48hFollowupEmail(
      user.email,
      firstName,
      hasEvent,
      'wedding',
      data.event_date ?? null,
      daysUntilEvent,
      suggested,
      primaryCategory,
      user.id
    );

    await supabase
      .from('users')
      .update({ followup_48h_sent_at: new Date().toISOString() })
      .eq('id', user.id);
  }
}

export async function runVendor48hFollowup(supabase: Sb = createServiceRoleClient()): Promise<void> {
  const now = new Date();
  // 24h-wide window (36h-60h since signup) — sized to overlap with the daily
  // cron schedule regardless of when the user signed up. The followup_48h_sent_at
  // gate prevents double-fires if a user falls into multiple consecutive runs.
  const windowStart = new Date(now.getTime() - 60 * 3600 * 1000).toISOString();
  const windowEnd = new Date(now.getTime() - 36 * 3600 * 1000).toISOString();

  const { data: candidates } = await supabase
    .from('vendor_profiles')
    .select('id, business_name, user_id, published_at, followup_48h_sent_at, users!user_id(email)')
    .gte('published_at', windowStart)
    .lte('published_at', windowEnd)
    .is('followup_48h_sent_at', null);

  const candidateList = candidates ?? [];
  if (candidateList.length === 0) return;

  // Batch: one query for the vendor profiles that already have ≥1 booking (they
  // get skipped), replacing the per-candidate count query.
  const vpIds = candidateList.map((vp) => vp.id);
  const bookedVpIds = new Set<string>();
  const { data: bookedRows } = await supabase
    .from('bookings')
    .select('vendor_profile_id')
    .in('vendor_profile_id', vpIds);
  for (const row of bookedRows ?? []) {
    if (row.vendor_profile_id) bookedVpIds.add(row.vendor_profile_id);
  }

  for (const vp of candidateList) {
    if (bookedVpIds.has(vp.id)) continue;

    const u = Array.isArray(vp.users) ? vp.users[0] : vp.users;
    if (!u?.email) continue;

    await sendVendor48hFollowupEmail(u.email, vp.business_name ?? 'Vendor', vp.user_id);
    await supabase
      .from('vendor_profiles')
      .update({ followup_48h_sent_at: new Date().toISOString() })
      .eq('id', vp.id);
  }
}
