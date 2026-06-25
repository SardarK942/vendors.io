import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

export type WizardStep = 'basics' | 'location' | 'online' | 'details' | 'portfolio' | 'review';

export type WizardMode = 'first' | 'next';

export interface ProfileRowShape {
  business_name: string | null;
  category: string | null;
  bio: string | null;
  base_address_line_1: string | null;
  base_city: string | null;
  base_state: string | null;
  base_postal_code: string | null;
  base_google_place_id: string | null;
  /** Set to true when vendor checked "I don't have a fixed address". Persisted since migration 00061. */
  base_address_skipped?: boolean | null;
  instagram_handle: string | null;
  languages?: string[] | null;
  years_in_business?: number | null;
  response_sla_hours?: number | null;
  portfolio_images: string[] | null;
}

/**
 * Resolve the vendor_profile that the wizard should operate on.
 *
 * 'first' mode: find ANY existing profile for this user (complete or partial)
 *   and return its id. If none exists, create a fresh row. Preserves the legacy
 *   single-business behavior.
 *
 * 'next' mode (Sub-project I §6): the user is adding a second business via the
 *   "Add another business" link. If the user has exactly one in-progress
 *   (onboarding_complete=false) profile AND at least one complete profile,
 *   resume the partial — this preserves an abandoned second-business attempt
 *   across sessions. Otherwise create a fresh row.
 *
 * Returns { profileId, isNew } where isNew indicates whether a new row was
 * inserted on this call.
 */
export async function getOrCreateWizardProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
  mode: WizardMode
): Promise<{ profileId: string; isNew: boolean }> {
  if (mode === 'first') {
    // Find ANY existing profile for this user (complete or partial).
    const { data: any_existing } = await supabase
      .from('vendor_profiles')
      .select('id')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (any_existing && any_existing.length > 0) {
      return { profileId: any_existing[0].id, isNew: false };
    }

    // None exists — create a fresh row.
    const { data: created, error } = await supabase
      .from('vendor_profiles')
      .insert({
        user_id: userId,
        business_name: '',
        // Slug stays null until the vendor completes basics; the partial unique
        // index (migration 00060) covers WHERE slug IS NOT NULL so concurrent
        // wizard stubs don't collide on the constraint.
        slug: null,
        category:
          'photography' as Database['public']['Tables']['vendor_profiles']['Insert']['category'],
        service_area: [],
        portfolio_images: [],
        onboarding_complete: false,
        is_active: false,
      })
      .select('id')
      .single();

    if (error || !created) {
      throw new Error(
        `getOrCreateWizardProfile(first): insert failed — ${error?.message ?? 'unknown'}`
      );
    }
    return { profileId: created.id, isNew: true };
  }

  // 'next' mode: check for an abandoned partial second-business attempt.
  const { data: partials } = await supabase
    .from('vendor_profiles')
    .select('id, created_at')
    .eq('user_id', userId)
    .eq('onboarding_complete', false)
    .order('created_at', { ascending: false });

  const { count: completedCount } = await supabase
    .from('vendor_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('onboarding_complete', true);

  // Resume only when there's exactly one partial AND at least one complete
  // profile — that uniquely identifies an abandoned second-business attempt.
  if (partials && partials.length === 1 && (completedCount ?? 0) > 0) {
    return { profileId: partials[0].id, isNew: false };
  }

  // Otherwise create a fresh row for the second business.
  const { data: created, error } = await supabase
    .from('vendor_profiles')
    .insert({
      user_id: userId,
      business_name: '',
      slug: null,
      // Placeholder — replaced when the vendor completes the basics step.
      category:
        'photography' as Database['public']['Tables']['vendor_profiles']['Insert']['category'],
      service_area: [],
      portfolio_images: [],
      onboarding_complete: false,
      is_active: false,
    })
    .select('id')
    .single();

  if (error || !created) {
    throw new Error(
      `getOrCreateWizardProfile(next): insert failed — ${error?.message ?? 'unknown'}`
    );
  }
  return { profileId: created.id, isNew: true };
}

export function nextIncompleteStep(profile: ProfileRowShape | null): WizardStep {
  if (!profile) return 'basics';
  if (!profile.business_name || !profile.category || !profile.bio || profile.bio.length < 50) {
    return 'basics';
  }
  // A vendor who checked "I don't have a fixed address" has base_address_skipped=true.
  // In that case all address fields are intentionally empty — skip the address check.
  const addressSkipped = !!profile.base_address_skipped;
  if (
    !addressSkipped &&
    (!profile.base_address_line_1 ||
      !profile.base_city ||
      !profile.base_state ||
      !profile.base_postal_code ||
      !profile.base_google_place_id)
  ) {
    return 'location';
  }
  // 'online' step is fully optional (Instagram + website both optional). It is
  // never auto-routed to; vendors can still navigate there from the sidebar.
  if (
    !profile.languages ||
    profile.languages.length === 0 ||
    profile.years_in_business === null ||
    profile.years_in_business === undefined ||
    profile.response_sla_hours === null ||
    profile.response_sla_hours === undefined
  ) {
    return 'details';
  }
  if (!profile.portfolio_images || profile.portfolio_images.length < 1) return 'portfolio';
  return 'review';
}
