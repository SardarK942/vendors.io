'use server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { hashTokenString, parseTokenString } from '../../../../scripts/scraper/lib/claim-token';
import { promoteScrapedVendor } from '@/lib/scraped-vendor/promote';

export interface ClaimResult {
  ok: boolean;
  reason?: 'invalid' | 'expired' | 'revoked' | 'already_claimed' | 'unknown';
  profileId?: string;
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
  if (data.claimed_at) return { ok: false, reason: 'already_claimed' };
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
    return { ok: true, profileId: profile.id };
  } catch {
    return { ok: false, reason: 'unknown' };
  }
}
