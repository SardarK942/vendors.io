import crypto from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

function newToken(): string {
  // 16 random bytes → base64url, trimmed to 22 chars (drop the trailing '==')
  return crypto.randomBytes(16).toString('base64url');
}

export async function getOrCreateFeedToken(
  supabase: SupabaseClient,
  vendorProfileId: string
): Promise<string> {
  const { data, error } = await supabase
    .from('vendor_profiles')
    .select('calendar_feed_token')
    .eq('id', vendorProfileId)
    .single();
  if (error) throw new Error(`getOrCreateFeedToken: ${error.message}`);
  if (data?.calendar_feed_token) return data.calendar_feed_token;

  const token = newToken();
  const { error: updErr } = await supabase
    .from('vendor_profiles')
    .update({ calendar_feed_token: token })
    .eq('id', vendorProfileId);
  if (updErr) throw new Error(`getOrCreateFeedToken (update): ${updErr.message}`);
  return token;
}

export async function rotateFeedToken(
  supabase: SupabaseClient,
  vendorProfileId: string
): Promise<string> {
  const token = newToken();
  const { error } = await supabase
    .from('vendor_profiles')
    .update({
      calendar_feed_token: token,
      calendar_feed_state: 'not_connected',
      calendar_feed_intent_at: null,
      calendar_feed_intent_method: null,
      calendar_feed_connected_at: null,
      calendar_feed_connected_via_ua: null,
    })
    .eq('id', vendorProfileId);
  if (error) throw new Error(`rotateFeedToken: ${error.message}`);
  return token;
}
