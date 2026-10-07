'use server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import { hashTokenString, parseTokenString } from '../../../../scripts/scraper/lib/claim-token';
import { promoteScrapedVendor } from '@/lib/scraped-vendor/promote';
import { nextIncompleteStep, type ProfileRowShape } from '@/lib/onboarding/resume';

const SETUP_PATH = '/dashboard/profile/setup';
const PROFILE_PATH = '/dashboard/profile';

export interface ClaimResult {
  ok: boolean;
  reason?: 'invalid' | 'expired' | 'revoked' | 'already_claimed' | 'unknown';
  profileId?: string;
  /** Where the claim page should send the user on success. */
  redirectTo?: string;
}

/**
 * If this scraped vendor was already claimed by the CURRENT user, return where
 * to send them (resume onboarding, or their live profile). Returns null when
 * it was claimed by someone else — the caller treats that as `already_claimed`.
 * Ownership is read from the promoted profile, so it holds even for older
 * tokens that predate `claimed_by_user_id`.
 */
async function resolveOwnClaim(
  supabase: SupabaseClient<Database>,
  scrapedVendorId: string,
  userId: string
): Promise<{ profileId: string; redirectTo: string } | null> {
  const { data: sv } = await supabase
    .from('scraped_vendors')
    .select('claimed_vendor_profile_id')
    .eq('id', scrapedVendorId)
    .maybeSingle();
  const profileId = sv?.claimed_vendor_profile_id;
  if (!profileId) return null;

  const { data: profile } = await supabase
    .from('vendor_profiles')
    .select(
      'user_id, onboarding_complete, business_name, category, bio, base_address_line_1, base_city, base_state, base_postal_code, base_google_place_id, base_address_skipped, instagram_handle, website_url, languages, years_in_business, response_sla_hours, portfolio_images'
    )
    .eq('id', profileId)
    .maybeSingle();
  if (!profile || profile.user_id !== userId) return null;

  // Carry a flag so the destination can explain why they're back here. Resume
  // straight at the next unfinished step so the flag lands on the final URL
  // (the setup index redirect would otherwise drop it).
  if (profile.onboarding_complete) {
    return { profileId, redirectTo: `${PROFILE_PATH}?claimed=live` };
  }
  const step = nextIncompleteStep(profile as ProfileRowShape);
  return { profileId, redirectTo: `${SETUP_PATH}/${step}?claimed=resumed` };
}

export async function verifyAndConsumeToken(token: string, userId: string): Promise<ClaimResult> {
  const parsed = parseTokenString(token);
  if (!parsed) return { ok: false, reason: 'invalid' };

  const supabase = await createServiceRoleClient();
  const hash = hashTokenString(token);
  const { data, error } = await supabase
    .from('claim_tokens')
    .select('id, scraped_vendor_id, expires_at, claimed_at, revoked_at')
    .eq('token_hash', hash)
    .maybeSingle();
  if (error || !data) return { ok: false, reason: 'invalid' };
  if (data.revoked_at) return { ok: false, reason: 'revoked' };

  // Token already consumed. If THIS user is the one who claimed it, send them
  // back to their profile instead of a dead end; block everyone else.
  if (data.claimed_at) {
    const own = await resolveOwnClaim(supabase, data.scraped_vendor_id, userId);
    if (own) return { ok: true, profileId: own.profileId, redirectTo: own.redirectTo };
    return { ok: false, reason: 'already_claimed' };
  }

  if (new Date(data.expires_at).getTime() < Date.now()) return { ok: false, reason: 'expired' };

  try {
    const profile = await promoteScrapedVendor(data.scraped_vendor_id, userId);
    await supabase
      .from('claim_tokens')
      .update({
        claimed_at: new Date().toISOString(),
        claimed_by_user_id: userId,
      })
      .eq('id', data.id);
    return { ok: true, profileId: profile.id, redirectTo: SETUP_PATH };
  } catch {
    return { ok: false, reason: 'unknown' };
  }
}
