import { createServerSupabaseClient } from '@/lib/supabase/server';
import { VendorGrid } from '@/components/marketplace/VendorGrid';
import { FilterShell } from '@/components/marketplace/filters/FilterShell';
import { parseVendorFilterParams, applyVendorFilters } from '@/lib/vendor-filters';
import type { VendorCardProps } from '@/components/marketplace/VendorCard';
import type { Metadata } from 'next';

type VendorWithEnrichments = VendorCardProps['vendor'];

export const metadata: Metadata = {
  title: 'Browse Vendors',
  description: 'Find verified Desi wedding vendors in Chicago — photography, mehndi, DJ, and more.',
};

interface VendorsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function VendorsPage({ searchParams }: VendorsPageProps) {
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();

  const filters = parseVendorFilterParams(params as Record<string, string | string[] | undefined>);
  const category = filters.category; // for FilterShell prop
  const page = typeof params.page === 'string' ? Number(params.page) : 1;
  const limit = 20;
  const offset = (page - 1) * limit;

  let query = supabase
    .from('vendor_profiles')
    .select(
      '*, vendor_packages_price_band!vendor_packages_price_band_vendor_profile_id_fkey(min_price_cents, max_price_cents)',
      { count: 'exact' }
    )
    .eq('is_active', true)
    .eq('onboarding_complete', true);

  query = applyVendorFilters(query, filters);

  query = query
    .order('verified', { ascending: false })
    .order('total_bookings', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data: vendors, count } = await query;
  const totalPages = Math.ceil((count ?? 0) / limit);

  // Date availability: parse from URL params, only forward if it matches ISO format.
  const searchDateParam =
    typeof params.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : null;

  // Fetch enrichments via RPC and merge by vendor id.
  const { data: enrichments } = await supabase.rpc('vendor_list_enrichments', {
    p_search_date: searchDateParam,
  });

  const enrichmentMap = new Map<
    string,
    { confirmed_wedding_count: number; is_available_for_date: boolean | null }
  >();
  (enrichments ?? []).forEach(
    (row: {
      vendor_profile_id: string;
      confirmed_wedding_count: number;
      is_available_for_date: boolean | null;
    }) => {
      enrichmentMap.set(row.vendor_profile_id, {
        confirmed_wedding_count: row.confirmed_wedding_count,
        is_available_for_date: row.is_available_for_date,
      });
    }
  );

  const enrichedVendors = (vendors ?? []).map((v) => ({
    ...v,
    // Supabase types the FK join as SelectQueryError when the relation hint is
    // used — cast the price band to the narrow shape VendorCard expects.
    vendor_packages_price_band: v.vendor_packages_price_band as unknown as
      | { min_price_cents: number | null; max_price_cents: number | null }
      | null
      | undefined,
    ...(enrichmentMap.get(v.id) ?? {
      confirmed_wedding_count: 0,
      is_available_for_date: null,
    }),
  })) as VendorWithEnrichments[];

  return (
    <div className="py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Browse Vendors</h1>
        <p className="text-muted-foreground">
          {count ?? 0} vendor{(count ?? 0) !== 1 ? 's' : ''} found
        </p>
      </div>

      <FilterShell initialCategory={category} />
      <VendorGrid vendors={enrichedVendors} searchDate={searchDateParam ?? undefined} />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-8 flex justify-center gap-2">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <a
              key={p}
              href={`/vendors?${new URLSearchParams({
                ...(category ? { category } : {}),
                page: String(p),
              }).toString()}`}
              className={`rounded border px-3 py-1 text-sm ${
                p === page ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'
              }`}
            >
              {p}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
