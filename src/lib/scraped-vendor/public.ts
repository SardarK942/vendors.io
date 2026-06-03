import { createServiceRoleClient } from '@/lib/supabase/server';

export interface UnclaimedVendor {
  id: string;
  slug: string;
  business_name: string;
  category: string | null;
  city: string | null;
  state: string;
  tags: string[];
  instagram_handle: string | null;
  website: string | null;
  bio: string | null;
  photos: string[];
}

export interface UnclaimedVendorListItem {
  id: string;
  slug: string;
  business_name: string;
  category: string | null;
  city: string | null;
  state: string;
  instagram_handle: string | null;
  bio: string | null;
  photos: string[];
}

/** Look up a single unclaimed scraped vendor by slug. Returns null if
 *  not found, already claimed, disputed, or rejected. */
export async function getUnclaimedBySlug(slug: string): Promise<UnclaimedVendor | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc('public_scraped_vendors_by_slug', { p_slug: slug });
  if (error) return null;
  const rows = (data ?? []) as UnclaimedVendor[];
  return rows[0] ?? null;
}

/** List unclaimed scraped vendors, optionally filtered by category + city. */
export async function listUnclaimed(opts: {
  category?: string | null;
  city?: string | null;
  limit?: number;
}): Promise<UnclaimedVendorListItem[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc('public_scraped_vendors_list', {
    p_category: opts.category ?? null,
    p_city: opts.city ?? null,
    p_limit: opts.limit ?? 60,
  });
  if (error) return [];
  return (data ?? []) as UnclaimedVendorListItem[];
}
