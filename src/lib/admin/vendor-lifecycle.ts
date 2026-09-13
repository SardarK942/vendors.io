import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import { liveUserIds, type NudgeUser } from '@/lib/onboarding/nudge-candidates';

export interface VendorLifecycle {
  /** All role='vendor' users, decorated with email-confirmed status. */
  users: NudgeUser[];
  /** User ids with at least one published (onboarding_complete) profile. */
  live: Set<string>;
  /** User ids with at least one vendor_profile row (started onboarding). */
  started: Set<string>;
}

/**
 * Load the vendor onboarding lifecycle for the admin funnel + cohort views.
 * Mirrors the nudge cron (src/app/api/cron/tick/route.ts): confirmed status
 * lives in auth.users (not exposed via PostgREST), so it comes from the Admin
 * API and is paginated. Requires a service-role client (reads all users).
 */
export async function loadVendorLifecycle(
  supabase: SupabaseClient<Database>
): Promise<VendorLifecycle> {
  const { data: vendorRows } = await supabase
    .from('users')
    .select(
      'id, email, full_name, role, created_at, confirm_nudge_sent_at, onboarding_nudge_24h_sent_at, onboarding_nudge_7d_sent_at'
    )
    .eq('role', 'vendor');

  const confirmedIds = new Set<string>();
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) break;
    for (const u of data.users) if (u.email_confirmed_at) confirmedIds.add(u.id);
    if (data.users.length < 1000) break;
  }

  const { data: profiles } = await supabase
    .from('vendor_profiles')
    .select('user_id, onboarding_complete');

  const live = liveUserIds(profiles ?? []);
  const started = new Set((profiles ?? []).map((p) => p.user_id));

  const users: NudgeUser[] = (vendorRows ?? []).map((u) => ({
    id: u.id,
    email: u.email,
    full_name: u.full_name,
    role: u.role,
    created_at: u.created_at,
    confirmed: confirmedIds.has(u.id),
    confirm_nudge_sent_at: u.confirm_nudge_sent_at,
    onboarding_nudge_24h_sent_at: u.onboarding_nudge_24h_sent_at,
    onboarding_nudge_7d_sent_at: u.onboarding_nudge_7d_sent_at,
  }));

  return { users, live, started };
}
