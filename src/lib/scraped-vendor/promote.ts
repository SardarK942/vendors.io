import crypto from 'node:crypto';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateSlug } from '@/lib/utils';

export interface PromotedProfile {
  id: string;
  user_id: string;
  business_name: string;
  category: string | null;
}

/** Promote a scraped_vendors row to vendor_profiles, link the two, mark claimed.
 *  Throws if the scraped row has no category (NOT NULL on vendor_profiles.category)
 *  or if it's already claimed. */
export async function promoteScrapedVendor(
  scrapedVendorId: string,
  userId: string
): Promise<PromotedProfile> {
  const supabase = await createServiceRoleClient();

  const { data: sv, error: svErr } = await supabase
    .from('scraped_vendors')
    .select('*')
    .eq('id', scrapedVendorId)
    .single();
  if (svErr || !sv) throw new Error(`scraped_vendor not found: ${scrapedVendorId}`);
  if (sv.claimed_at) throw new Error('already claimed');
  if (!sv.category) {
    throw new Error('scraped row has null category; cannot promote without category set');
  }

  const slugSuffix = crypto.randomBytes(3).toString('hex'); // 6-char hex
  const slug = `${generateSlug(sv.business_name)}-${slugSuffix}`;

  const { data: profile, error: profErr } = await supabase
    .from('vendor_profiles')
    .insert({
      user_id: userId,
      business_name: sv.business_name,
      slug,
      category: sv.category as never, // category is validated above; cast satisfies the enum union
      bio: sv.bio,
      instagram_handle: sv.instagram_handle,
      portfolio_images: sv.photos,
      base_city: sv.city,
      base_state: sv.state,
      base_postal_code: sv.postal_code,
      is_active: false,
      onboarding_complete: false,
    })
    .select()
    .single();
  if (profErr || !profile) throw new Error(profErr?.message ?? 'vendor_profiles insert failed');

  const { error: updErr } = await supabase
    .from('scraped_vendors')
    .update({
      claimed_at: new Date().toISOString(),
      claimed_vendor_profile_id: profile.id,
    })
    .eq('id', scrapedVendorId);
  if (updErr) throw new Error(updErr.message);

  return {
    id: profile.id,
    user_id: profile.user_id,
    business_name: profile.business_name,
    category: profile.category,
  };
}
