import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

type VendorProfileRow = Database['public']['Tables']['vendor_profiles']['Row'];

export interface ActiveVendorResult {
  profile: VendorProfileRow | null;
  totalCount: number;
}

/**
 * Resolve the user's active vendor profile.
 *
 * Resolution order:
 * 1. users.active_vendor_profile_id is set AND points to a profile owned by
 *    this user → return that profile.
 * 2. Else the user has exactly one vendor_profile → return it (single-business
 *    fallback; covers 97% of vendors with zero behavior change).
 * 3. Else the user has multiple vendor_profiles but no active set (or active
 *    pointer is stale) → return the first by created_at ASC AND persist it as
 *    active_vendor_profile_id so subsequent calls are cheap.
 * 4. Else (zero vendor_profiles) → return null. Caller redirects to onboarding.
 *
 * Sub-project I §5.
 */
export async function getActiveVendorProfile(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<ActiveVendorResult> {
  // Single round-trip: fetch all profiles owned by this user (gives us totalCount
  // + the candidate row for explicit-pointer or fallback resolution).
  const { data: profiles } = await supabase
    .from('vendor_profiles')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  const list = (profiles ?? []) as VendorProfileRow[];
  const totalCount = list.length;

  if (totalCount === 0) {
    return { profile: null, totalCount: 0 };
  }

  // Read the user's active pointer.
  const { data: userRow } = await supabase
    .from('users')
    .select('active_vendor_profile_id')
    .eq('id', userId)
    .single();

  const activeId = userRow?.active_vendor_profile_id ?? null;

  // Resolution 1: explicit pointer + ownership check (re-check via list membership).
  if (activeId) {
    const owned = list.find((p) => p.id === activeId);
    if (owned) return { profile: owned, totalCount };
    // Pointer is stale (points to a profile this user no longer owns). Fall through.
  }

  // Resolution 2: single profile (no active pointer needed).
  if (totalCount === 1) {
    return { profile: list[0], totalCount };
  }

  // Resolution 3: multiple profiles, no/stale active. Pick the oldest, persist it.
  const first = list[0];
  await supabase
    .from('users')
    .update({ active_vendor_profile_id: first.id })
    .eq('id', userId);

  return { profile: first, totalCount };
}

/**
 * Light variant when the caller only needs the active profile ID.
 */
export async function getActiveVendorProfileId(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<string | null> {
  const { profile } = await getActiveVendorProfile(supabase, userId);
  return profile?.id ?? null;
}
