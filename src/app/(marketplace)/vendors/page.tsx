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
  const priceMin = typeof params.priceMin === 'string' ? Number(params.priceMin) : undefined;
  const priceMax = typeof params.priceMax === 'string' ? Number(params.priceMax) : undefined;
  const page = typeof params.page === 'string' ? Number(params.page) : 1;
  const limit = 20;
  const offset = (page - 1) * limit;

  let query = supabase.from('vendor_profiles').select('*', { count: 'exact' });

  if (category) query = query.eq('category', category);
  if (priceMin) query = query.gte('starting_price_min', priceMin);
  if (priceMax) query = query.lte('starting_price_max', priceMax);

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

      <div className="mb-6">
        <SearchBar />
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
                    ...(priceMin ? { priceMin: String(priceMin) } : {}),
                    ...(priceMax ? { priceMax: String(priceMax) } : {}),
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
