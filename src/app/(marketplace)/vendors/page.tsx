import { createServerSupabaseClient } from '@/lib/supabase/server';
import { VendorGrid } from '@/components/marketplace/VendorGrid';
import { FilterShell } from '@/components/marketplace/filters/FilterShell';
import { parseVendorFilterParams, applyVendorFilters } from '@/lib/vendor-filters';
import { SavedVendorsProvider } from '@/components/marketplace/SavedVendorsProvider';
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

  // NOTE: vendor_packages_price_band is a VIEW — PostgREST cannot resolve FK joins
  // to views. Price band is fetched in a separate parallel query and merged by vendor id.
  let query = supabase
    .from('vendor_profiles')
    .select('*', { count: 'exact' })
    .eq('is_active', true)
    .eq('onboarding_complete', true);

  query = applyVendorFilters(query, filters);

  query = query
    .order('verified', { ascending: false })
    .order('total_bookings', { ascending: false })
    .range(offset, offset + limit - 1);

  // Date availability: parse from URL params, only forward if it matches ISO format.
  const searchDateParam =
    typeof params.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : null;

  // Run vendors + enrichments + price band in parallel.
  // Unclaimed (scraped) vendors are hidden from public browse for now — we'll
  // be onboarding vendors manually until first-batch claim flow settles.
  const [{ data: vendors, count }, { data: enrichments }, { data: priceBands }] = await Promise.all(
    [
      query,
      supabase.rpc('vendor_list_enrichments', { p_search_date: searchDateParam }),
      supabase
        .from('vendor_packages_price_band')
        .select('vendor_profile_id, min_price_cents, max_price_cents'),
    ]
  );

  const totalPages = Math.ceil((count ?? 0) / limit);

  // Build enrichment lookup map.
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

  // Build price band lookup map.
  const priceBandMap = new Map<
    string,
    { min_price_cents: number | null; max_price_cents: number | null }
  >();
  (priceBands ?? []).forEach((row) => {
    if (!row.vendor_profile_id) return;
    priceBandMap.set(row.vendor_profile_id, {
      min_price_cents: row.min_price_cents,
      max_price_cents: row.max_price_cents,
    });
  });

  const enrichedVendors = (vendors ?? []).map((v) => ({
    ...v,
    vendor_packages_price_band: priceBandMap.get(v.id) ?? null,
    ...(enrichmentMap.get(v.id) ?? {
      confirmed_wedding_count: 0,
      is_available_for_date: null,
    }),
  })) as VendorWithEnrichments[];

  const totalCount = count ?? 0;

  return (
    <SavedVendorsProvider>
      <div className="py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Browse Vendors</h1>
          <p className="text-muted-foreground">
            {totalCount} vendor{totalCount !== 1 ? 's' : ''}
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
                  p === page
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'hover:bg-muted'
                }`}
              >
                {p}
              </a>
            ))}
          </div>
        )}
      </div>
    </SavedVendorsProvider>
  );
}
