import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import type { ServiceResult, VendorProfileInput, VendorSearchInput } from '@/types';

type VendorRow = Database['public']['Tables']['vendor_profiles']['Row'];

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
): Promise<ServiceResult<{ vendors: VendorRow[]; count: number }>> {
  const { category, priceMin, priceMax, serviceArea, page, limit } = filters;
  const offset = (page - 1) * limit;

  let query = supabase.from('vendor_profiles').select('*', { count: 'exact' });

  if (category) {
    query = query.eq('category', category);
  }
  if (priceMin !== undefined) {
    query = query.gte('starting_price_min', priceMin);
  }
  if (priceMax !== undefined) {
    query = query.lte('starting_price_max', priceMax);
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

  return { data: { vendors: data ?? [], count: count ?? 0 }, status: 200 };
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

  return { data, status: 200 };
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
      starting_price_min: input.startingPriceMin,
      starting_price_max: input.startingPriceMax,
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
