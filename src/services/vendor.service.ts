import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import type { ServiceResult, VendorProfileInput, VendorSearchInput } from '@/types';

type VendorRow = Database['public']['Tables']['vendor_profiles']['Row'];

// Price-band filtering uses the vendor_packages_price_band view which is a
// LEFT JOIN in the query to avoid excluding vendors with no packages yet.
type VendorWithPriceBand = VendorRow & {
  vendor_packages_price_band?: {
    min_price_cents: number | null;
    max_price_cents: number | null;
  } | null;
};

export async function getVendorBySlug(
  supabase: SupabaseClient<Database>,
  slug: string
): Promise<
  ServiceResult<VendorRow & { users: { full_name: string | null; email: string } | null }>
> {
  const { data, error } = await supabase
    .from('vendor_profiles')
    .select('*, users!vendor_profiles_user_id_fkey(full_name, email)')
    .eq('slug', slug)
    .single();

  if (error || !data) {
    return { error: 'Vendor not found', status: 404 };
  }

  return {
    data: data as VendorRow & { users: { full_name: string | null; email: string } | null },
    status: 200,
  };
}

export async function getVendors(
  supabase: SupabaseClient<Database>,
  filters: VendorSearchInput
): Promise<ServiceResult<{ vendors: VendorWithPriceBand[]; count: number }>> {
  const { category, priceMin, priceMax, serviceArea, page, limit } = filters;
  const offset = (page - 1) * limit;

  // Left-join the price band view so vendors with no active packages still appear.
  let query = supabase
    .from('vendor_profiles')
    .select(
      '*, vendor_packages_price_band!vendor_packages_price_band_vendor_profile_id_fkey(min_price_cents, max_price_cents)',
      { count: 'exact' }
    );

  if (category) {
    query = query.eq('category', category);
  }
  if (serviceArea) {
    query = query.contains('service_area', [serviceArea]);
  }

  query = query
    .order('verified', { ascending: false })
    .order('total_bookings', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    return { error: 'Failed to fetch vendors', status: 500 };
  }

  // Apply price-band filter in application layer (view is not filterable in query without subselect).
  let vendors = (data ?? []) as unknown as VendorWithPriceBand[];
  if (priceMin !== undefined) {
    vendors = vendors.filter((v) => {
      const min = (v.vendor_packages_price_band as { min_price_cents: number | null } | null)
        ?.min_price_cents;
      return min != null && min >= priceMin;
    });
  }
  if (priceMax !== undefined) {
    vendors = vendors.filter((v) => {
      const max = (v.vendor_packages_price_band as { max_price_cents: number | null } | null)
        ?.max_price_cents;
      return max != null && max <= priceMax;
    });
  }

  return { data: { vendors, count: count ?? 0 }, status: 200 };
}

export async function claimVendorProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
  vendorProfileId: string
): Promise<ServiceResult<VendorRow>> {
  // Check the profile exists and is unclaimed
  const { data: profile } = await supabase
    .from('vendor_profiles')
    .select('*')
    .eq('id', vendorProfileId)
    .single();

  if (!profile) {
    return { error: 'Vendor profile not found', status: 404 };
  }

  if (profile.user_id) {
    return { error: 'This profile has already been claimed', status: 409 };
  }

  // Check user doesn't already have a profile
  const { data: existing } = await supabase
    .from('vendor_profiles')
    .select('id')
    .eq('user_id', userId)
    .single();

  if (existing) {
    return { error: 'You already have a vendor profile', status: 409 };
  }

  // Claim the profile
  const { data, error } = await supabase
    .from('vendor_profiles')
    .update({ user_id: userId })
    .eq('id', vendorProfileId)
    .select()
    .single();

  if (error) {
    return { error: 'Failed to claim profile', status: 500 };
  }

  // Mark onboarding complete so claim-flow vendors skip the welcome modal.
  // They go through the vendor setup wizard instead — that is their onboarding.
  await supabase
    .from('users')
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq('id', userId);

  return { data, status: 200 };
}

/** Returns vendors the user has hearted, sorted by saved_at desc. */
export async function getSavedVendorsForUser(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<VendorRow[]> {
  const { data, error } = await supabase
    .from('saved_vendors')
    .select('saved_at, vendor_profiles!inner(*)')
    .eq('user_id', userId)
    .order('saved_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => r.vendor_profiles as unknown as VendorRow);
}

/** Returns up to N active vendors matching any of the given categories. Falls back to getRecentActiveVendors if categories is empty. */
export async function getVendorsByCategory(
  supabase: SupabaseClient<Database>,
  categories: string[],
  limit = 3
): Promise<VendorRow[]> {
  if (categories.length === 0) return getRecentActiveVendors(supabase, limit);
  const { data, error } = await supabase
    .from('vendor_profiles')
    .select('*')
    .eq('is_active', true)
    .eq('onboarding_complete', true)
    .in('category', categories as VendorRow['category'][])
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

/** Returns up to N most-recent active vendors (used as fallback for "just browsing" modal step 2). */
export async function getRecentActiveVendors(
  supabase: SupabaseClient<Database>,
  limit = 3
): Promise<VendorRow[]> {
  const { data, error } = await supabase
    .from('vendor_profiles')
    .select('*')
    .eq('is_active', true)
    .eq('onboarding_complete', true)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function updateVendorProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: Partial<VendorProfileInput>
): Promise<ServiceResult<VendorRow>> {
  const { data, error } = await supabase
    .from('vendor_profiles')
    .update({
      business_name: input.businessName,
      bio: input.bio,
      service_area: input.serviceArea,
      portfolio_images: input.portfolioImages,
      instagram_handle: input.instagramHandle,
      website_url: input.websiteUrl || null,
      response_sla_hours: input.responseSlaHours,
    })
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    return { error: 'Failed to update profile', status: 500 };
  }

  return { data, status: 200 };
}
