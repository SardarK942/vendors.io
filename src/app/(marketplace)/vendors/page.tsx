import { createServerSupabaseClient } from '@/lib/supabase/server';
import { VendorGrid } from '@/components/marketplace/VendorGrid';
import { FilterShell } from '@/components/marketplace/filters/FilterShell';
import { parseVendorFilterParams, applyVendorFilters } from '@/lib/vendor-filters';
import { SavedVendorsProvider } from '@/components/marketplace/SavedVendorsProvider';
import { hybridSearch } from '@/lib/ai/search';
import type { VendorCardProps } from '@/components/marketplace/VendorCard';
import type { Metadata } from 'next';
import { fmtCount } from '@/lib/intl';

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

  // AI search: when ?q= is present, run hybrid search first to get a ranked
  // vendor-id set, then intersect with the regular filter pipeline.
  const rawQuery = typeof params.q === 'string' ? params.q.trim() : '';
  let aiVendorIds: string[] | null = null;
  let aiCategoryHint: string | undefined;
  if (rawQuery) {
    const { vendors: aiVendors, parsedQuery } = await hybridSearch(supabase, rawQuery);
    aiVendorIds = aiVendors.map((v) => v.id);
    aiCategoryHint = parsedQuery.category;
  }

  // URL filters (explicit user choices win over AI category hint).
  const filters = parseVendorFilterParams(params as Record<string, string | string[] | undefined>);
  if (!filters.category && aiCategoryHint) filters.category = aiCategoryHint;
  const category = filters.category;
  const page = typeof params.page === 'string' ? Number(params.page) : 1;
  const limit = 20;
  const offset = (page - 1) * limit;

  // If AI search returned no matches, short-circuit to an empty-state page.
  if (aiVendorIds !== null && aiVendorIds.length === 0) {
    return (
      <SavedVendorsProvider>
        <div className="py-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">Browse Vendors</h1>
            <p className="text-muted-foreground">
              No matches for &ldquo;{rawQuery}&rdquo;. Try a broader query or clear filters.
            </p>
          </div>
          <FilterShell initialQuery={rawQuery} />
        </div>
      </SavedVendorsProvider>
    );
  }

  // NOTE: vendor_packages_price_band is a VIEW — PostgREST cannot resolve FK joins
  // to views. Price band is fetched in a separate parallel query and merged by vendor id.
  let query = supabase
    .from('vendor_profiles')
    .select('*', { count: 'exact' })
    .eq('is_active', true)
    .eq('onboarding_complete', true);

  query = applyVendorFilters(query, filters);
  if (aiVendorIds !== null) query = query.in('id', aiVendorIds);

  query = query
    .order('verified', { ascending: false })
    .order('total_bookings', { ascending: false })
    .range(offset, offset + limit - 1);

  // Date availability: parse from URL params, only forward if it matches ISO format.
  const searchDateParam =
    typeof params.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : null;

  // Run vendors + enrichments + price band in parallel.
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

  let enrichedVendors = (vendors ?? []).map((v) => ({
    ...v,
    vendor_packages_price_band: priceBandMap.get(v.id) ?? null,
    ...(enrichmentMap.get(v.id) ?? {
      confirmed_wedding_count: 0,
      is_available_for_date: null,
    }),
  })) as VendorWithEnrichments[];

  // Preserve AI ranking when ?q= was provided.
  if (aiVendorIds !== null) {
    const orderIndex = new Map(aiVendorIds.map((id, i) => [id, i]));
    enrichedVendors = enrichedVendors
      .slice()
      .sort((a, b) => (orderIndex.get(a.id) ?? 1e9) - (orderIndex.get(b.id) ?? 1e9));
  }

  const totalCount = count ?? 0;

  return (
    <SavedVendorsProvider>
      <div className="py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Browse Vendors</h1>
          <p className="tabular-nums text-muted-foreground" aria-live="polite" aria-atomic="true">
            {fmtCount(totalCount)} vendor{totalCount !== 1 ? 's' : ''}
            {rawQuery && (
              <>
                {' '}
                for &ldquo;<span className="text-ink">{rawQuery}</span>&rdquo;
              </>
            )}
          </p>
        </div>

        <FilterShell initialQuery={rawQuery} />
        <VendorGrid vendors={enrichedVendors} searchDate={searchDateParam ?? undefined} />

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-8 flex justify-center gap-2">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <a
                key={p}
                href={`/vendors?${new URLSearchParams({
                  ...(rawQuery ? { q: rawQuery } : {}),
                  ...(category ? { category } : {}),
                  page: String(p),
                }).toString()}`}
                className={`rounded border px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream ${
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
