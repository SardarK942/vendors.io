import type { SupabaseClient } from '@supabase/supabase-js';
import { PRICE_BANDS, type PriceBand } from '@/components/marketplace/filters/constants';

export interface VendorFilterParams {
  category?: string;
  verified?: boolean;
  respondsIn?: number;
  cashFriendly?: boolean;
  priceBand?: PriceBand;
  priceMin?: number; // cents
  priceMax?: number; // cents
  languages?: string[];
  years?: number;
  // events + style + cuisine etc — placeholder; not backed yet.
}

/**
 * Parse VendorFilterParams from URLSearchParams (server-side).
 * Mirrors readFilterState in use-filter-state.ts but returns the trimmed
 * server-friendly shape (only fields with a value).
 */
export function parseVendorFilterParams(
  params: Record<string, string | string[] | undefined>
): VendorFilterParams {
  const get = (k: string): string | undefined => {
    const v = params[k];
    return typeof v === 'string' ? v : undefined;
  };
  const out: VendorFilterParams = {};

  const category = get('category');
  if (category) out.category = category;
  if (get('verified') === '1') out.verified = true;
  if (get('cashFriendly') === '1') out.cashFriendly = true;

  const respondsIn = Number(get('respondsIn'));
  if (Number.isFinite(respondsIn) && respondsIn > 0) out.respondsIn = respondsIn;

  const priceBand = get('priceBand') as PriceBand | undefined;
  if (priceBand && PRICE_BANDS.some((b) => b.slug === priceBand)) out.priceBand = priceBand;

  const priceMin = Number(get('priceMin'));
  if (Number.isFinite(priceMin) && priceMin > 0) out.priceMin = priceMin;

  const priceMax = Number(get('priceMax'));
  if (Number.isFinite(priceMax) && priceMax > 0) out.priceMax = priceMax;

  const lang = get('lang');
  if (lang) out.languages = lang.split(',').filter(Boolean);

  const years = Number(get('years'));
  if (Number.isFinite(years) && years > 0) out.years = years;

  return out;
}

/**
 * Apply filter params to a Supabase vendor_profiles query.
 * Returns the chained query so the caller can add ordering + range + count modes.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyVendorFilters<Q extends { eq: any; gte: any; lte: any; contains: any }>(
  query: Q,
  filters: VendorFilterParams
): Q {
  let q = query;
  if (filters.category) q = q.eq('category', filters.category);
  if (filters.verified) q = q.eq('verified', true);
  if (filters.cashFriendly) q = q.eq('payment_mode', 'cash');
  if (filters.respondsIn) q = q.lte('response_sla_hours', filters.respondsIn);
  if (filters.years) q = q.gte('years_in_business', filters.years);

  // Price band → derived min/max range. priceMin/priceMax (explicit) override band.
  let minCents = filters.priceMin;
  let maxCents = filters.priceMax;
  if (filters.priceBand && minCents === undefined && maxCents === undefined) {
    const band = PRICE_BANDS.find((b) => b.slug === filters.priceBand);
    if (band) {
      minCents = band.minCents;
      if (band.maxCents !== null) maxCents = band.maxCents;
    }
  }
  if (minCents !== undefined) {
    // Joined table vendor_packages_price_band — filter via inner-join semantics
    // requires using or(); here we filter the band relation's max_price_cents >= minCents.
    // (Adjust to match actual relation if needed at implementation time.)
    q = q.gte('vendor_packages_price_band.max_price_cents', minCents);
  }
  if (maxCents !== undefined) {
    q = q.lte('vendor_packages_price_band.min_price_cents', maxCents);
  }

  if (filters.languages && filters.languages.length > 0) {
    q = q.contains('languages', filters.languages);
  }

  return q;
}

/**
 * Count vendors matching the given filters. Used by /api/vendors/count.
 * NOTE: Price-band filtering is NOT applied in this count endpoint.
 * The vendor_packages_price_band view cannot be joined via PostgREST foreign key syntax,
 * so price filtering only works in full vendor queries (getVendors in vendor.service.ts)
 * where filtering is applied in the application layer after fetching.
 * This is acceptable for the UI's live footer count, which only filters by
 * category, verification, cashFriendly, respondsIn, years, languages — all vendor_profiles columns.
 */
export async function countFilteredVendors(
  supabase: SupabaseClient,
  filters: VendorFilterParams
): Promise<number> {
  let query = supabase.from('vendor_profiles').select('id', {
    count: 'exact',
    head: true,
  });

  // Apply only non-price filters (price filtering is app-layer only)
  if (filters.category) query = query.eq('category', filters.category);
  if (filters.verified) query = query.eq('verified', true);
  if (filters.cashFriendly) query = query.eq('payment_mode', 'cash');
  if (filters.respondsIn) query = query.lte('response_sla_hours', filters.respondsIn);
  if (filters.years) query = query.gte('years_in_business', filters.years);
  if (filters.languages && filters.languages.length > 0) {
    query = query.contains('languages', filters.languages);
  }

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}
