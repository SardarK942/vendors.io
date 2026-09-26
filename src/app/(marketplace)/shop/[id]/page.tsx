import { notFound } from 'next/navigation';
import { Globe, Scissors, Clock, Shirt } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getProductById } from '@/services/products.service';
import { VendorGallery } from '@/components/marketplace/vendor-profile/VendorGallery';
import { mergePortfolioMedia } from '@/lib/portfolio-media';
import { formatPriceFromCents } from '@/components/marketplace/vendor-card-helpers';
import { GARMENT_TYPE_LABELS } from '@/lib/products/garment-types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ProductDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProductDetailPage({ params }: ProductDetailPageProps) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const result = await getProductById(supabase, id);

  // Not found, errored, or not publicly active → 404 (buyer view is active-only).
  if (!result.data || result.data.status !== 'active') {
    notFound();
  }

  const product = result.data;
  const garmentLabel = GARMENT_TYPE_LABELS[product.garment_type] ?? product.garment_type;
  const media = mergePortfolioMedia(product.images ?? [], product.video_uids ?? []);
  const price = formatPriceFromCents(product.base_price_cents);
  const hasUpsell = (product.variants ?? []).some((v) => (v.price_delta_cents ?? 0) > 0);
  const variants = [...(product.variants ?? [])].sort((a, b) => a.display_order - b.display_order);

  return (
    <div className="py-8">
      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        {/* Gallery */}
        <div>
          {media.length > 0 ? (
            <VendorGallery media={media} businessName={product.title} />
          ) : (
            <div
              className="flex aspect-[4/5] w-full items-center justify-center rounded-2xl border border-hairline bg-cream-soft"
              style={{
                backgroundImage: 'radial-gradient(rgba(209,0,108,0.06) 1.2px, transparent 1.2px)',
                backgroundSize: '16px 16px',
              }}
            >
              <Shirt className="size-16 text-ink/20" strokeWidth={1.25} aria-hidden="true" />
            </div>
          )}
        </div>

        {/* Details */}
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-indigo">
            {garmentLabel}
          </p>
          <h1
            className="mt-2 font-display text-3xl font-bold leading-tight text-ink"
            translate="no"
          >
            {product.title}
          </h1>

          {price && (
            <p className="mt-4 text-2xl font-semibold tabular-nums text-ink">
              {hasUpsell && <span className="text-base font-normal text-ink-muted">From </span>}
              {price}
            </p>
          )}

          {/* Attribute badges */}
          <div className="mt-5 flex flex-wrap gap-2">
            {product.ships_internationally && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-cream px-3 py-1 text-[12px] font-semibold text-ink">
                <Globe className="size-3.5 text-indigo" strokeWidth={2} aria-hidden="true" />
                Ships worldwide
              </span>
            )}
            {product.tailoring_available && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-cream px-3 py-1 text-[12px] font-semibold text-ink">
                <Scissors className="size-3.5 text-indigo" strokeWidth={2} aria-hidden="true" />
                Tailoring available
              </span>
            )}
            {product.lead_time_days != null && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-cream px-3 py-1 text-[12px] font-semibold text-ink">
                <Clock className="size-3.5 text-indigo" strokeWidth={2} aria-hidden="true" />
                Made to order · {product.lead_time_days} days
              </span>
            )}
          </div>

          {product.description && (
            <div className="mt-6">
              <h2 className="font-display text-lg font-bold text-ink">Details</h2>
              <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-ink-muted">
                {product.description}
              </p>
            </div>
          )}

          {/* Available sizes */}
          {variants.length > 0 && (
            <div className="mt-6">
              <h2 className="font-display text-lg font-bold text-ink">Available sizes</h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {variants.map((variant) => {
                  const outOfStock = variant.stock_quantity <= 0;
                  return (
                    <li
                      key={variant.id}
                      className={cn(
                        'inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[13px] font-semibold',
                        outOfStock
                          ? 'border-ink/10 bg-cream-soft text-ink-soft'
                          : 'border-ink/20 bg-cream text-ink'
                      )}
                    >
                      <span className={cn(outOfStock && 'line-through')}>{variant.size_label}</span>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 text-[11px] font-medium',
                          outOfStock ? 'text-ink-soft' : 'text-indigo'
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            'size-[6px] rounded-full',
                            outOfStock ? 'bg-ink-soft' : 'bg-indigo'
                          )}
                        />
                        {outOfStock ? 'Out of stock' : 'In stock'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Inquiry placeholder — no real booking/cart flow in this prototype. */}
          <div className="mt-8">
            <Button type="button" size="lg" disabled className="w-full sm:w-auto">
              Inquire — coming soon
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
