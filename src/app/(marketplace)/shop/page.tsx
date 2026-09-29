import Link from 'next/link';
import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getActiveProducts } from '@/services/products.service';
import { ProductGrid } from '@/components/marketplace/ProductGrid';
import { GARMENT_TYPES, GARMENT_TYPE_LABELS } from '@/lib/products/garment-types';
import type { GarmentType } from '@/types/database.types';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Bridal & Groom Wear',
  description:
    'Shop sarees, lehengas, sherwanis, and more — bridal and groom wear from verified Desi vendors.',
};

interface ShopPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function parseGarmentType(value: string | string[] | undefined): GarmentType | undefined {
  if (typeof value !== 'string') return undefined;
  return (GARMENT_TYPES as readonly string[]).includes(value) ? (value as GarmentType) : undefined;
}

export default async function ShopPage({ searchParams }: ShopPageProps) {
  const params = await searchParams;
  const garmentType = parseGarmentType(params.garment);

  const supabase = await createServerSupabaseClient();
  const result = await getActiveProducts(supabase, garmentType ? { garmentType } : {});
  const products = result.data ?? [];

  return (
    <div className="py-8">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold text-ink">Bridal &amp; Groom Wear</h1>
        <p className="mt-1 text-ink-muted">
          Sarees, lehengas, sherwanis, and more — shipped and tailored by verified vendors.
        </p>
      </div>

      {/* Garment-type filter chips */}
      <div className="mb-8 flex flex-wrap gap-2">
        <Link
          href="/shop"
          className={cn(
            'rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream',
            !garmentType
              ? 'border-ink bg-ink text-cream'
              : 'border-ink/15 bg-cream text-ink hover:border-hot-pink hover:text-hot-pink'
          )}
        >
          All
        </Link>
        {GARMENT_TYPES.map((type) => (
          <Link
            key={type}
            href={`/shop?garment=${type}`}
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream',
              garmentType === type
                ? 'border-ink bg-ink text-cream'
                : 'border-ink/15 bg-cream text-ink hover:border-hot-pink hover:text-hot-pink'
            )}
          >
            {GARMENT_TYPE_LABELS[type]}
          </Link>
        ))}
      </div>

      <ProductGrid products={products} />
    </div>
  );
}
