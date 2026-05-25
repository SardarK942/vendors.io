import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import { CATEGORIES_FEATURED } from './featured';

type Sb = SupabaseClient<Database>;

/**
 * Returns a count of vendor_profiles per featured homepage category.
 * Always returns an entry for every slug in CATEGORIES_FEATURED (zero
 * if no vendors). Non-featured categories (photobooth, invitations)
 * are excluded from the result.
 *
 * Failures are non-fatal: returns all-zero map and the caller renders
 * tiles with "Coming Soon" treatment for slugs with count 0.
 */
export async function getCategoryVendorCounts(supabase: Sb): Promise<Record<string, number>> {
  const featuredSlugs = new Set(CATEGORIES_FEATURED.map((c) => c.slug));

  const initial = Object.fromEntries(CATEGORIES_FEATURED.map((c) => [c.slug, 0])) as Record<
    string,
    number
  >;

  const { data, error } = await supabase.from('vendor_profiles').select('category');

  if (error || !data) {
    return initial;
  }

  for (const row of data) {
    const cat = (row as { category: string }).category;
    if (featuredSlugs.has(cat)) {
      initial[cat] += 1;
    }
  }

  return initial;
}
