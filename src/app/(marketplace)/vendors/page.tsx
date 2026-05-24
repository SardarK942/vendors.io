import { createServerSupabaseClient } from '@/lib/supabase/server';
import { VendorGrid } from '@/components/marketplace/VendorGrid';
import { FilterSidebar } from '@/components/marketplace/FilterSidebar';
import { SearchBar } from '@/components/marketplace/SearchBar';
import type { Metadata } from 'next';

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

  const category = typeof params.category === 'string' ? params.category : undefined;
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

  if (category) query = query.eq('category', category);

  query = query
    .order('verified', { ascending: false })
    .order('total_bookings', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data: vendors, count } = await query;
  const totalPages = Math.ceil((count ?? 0) / limit);

  return (
    <div className="py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Browse Vendors</h1>
        <p className="text-muted-foreground">
          {count ?? 0} vendor{(count ?? 0) !== 1 ? 's' : ''} found
        </p>
      </div>

      {/* Sticky search band — top-16 matches the Navbar's h-16. Negative margins
          cancel the parent's padding so the band spans full width, then restore
          with matching px-*. backdrop-blur mirrors the Navbar blur pattern.
          TODO: add scroll-triggered shadow once scrolled > 100px (spec §7 polish). */}
      <div className="sticky top-16 z-30 -mx-4 mb-6 border-b border-hairline bg-cream/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-cream/80 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <SearchBar variant="sticky-header" initialCategory={category} />
      </div>

      <div className="flex gap-8">
        <div className="hidden w-56 shrink-0 lg:block">
          <FilterSidebar />
        </div>
        <div className="flex-1">
          <VendorGrid vendors={vendors ?? []} />

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
      </div>
    </div>
  );
}
