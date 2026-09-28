import Link from 'next/link';
import Image from 'next/image';
import { Shirt, BadgeCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatPriceFromCents } from './vendor-card-helpers';
import { GARMENT_TYPE_LABELS } from '@/lib/products/garment-types';
import { offersMadeToMeasure } from '@/lib/products/customization';
import type { ProductWithVendor } from '@/services/products.service';

export interface ProductCardProps {
  product: ProductWithVendor;
}

/**
 * Buyer-facing catalog card for a Shop product (bridal/groom wear prototype).
 * Mirrors VendorCard's shape — hero image (or a garment-tile fallback),
 * garment-type chip, title, and price from cents. Links to /shop/{id} since
 * products have no slug. Server component: no interactivity needed here.
 */
export function ProductCard({ product }: ProductCardProps) {
  const heroImage = product.images?.[0];
  const garmentLabel = GARMENT_TYPE_LABELS[product.garment_type] ?? product.garment_type;
  const price = formatPriceFromCents(product.base_price_cents);
  // "From" when any variant carries a positive price delta over the base.
  const hasUpsell = (product.variants ?? []).some((v) => (v.price_delta_cents ?? 0) > 0);
  const madeToMeasure = offersMadeToMeasure(product.customization_types ?? []);

  return (
    <Link
      href={`/shop/${product.id}`}
      data-product-id={product.id}
      className={cn(
        'group relative block overflow-hidden rounded-2xl border border-hairline bg-cream',
        'hover-lift-card',
        'transition-transform active:scale-[0.98] motion-reduce:active:scale-100'
      )}
    >
      {/* Photo */}
      <div className="relative aspect-[4/5] overflow-hidden bg-cream-soft">
        {heroImage ? (
          <Image
            src={heroImage}
            alt={`${product.title} — ${garmentLabel}`}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            className={cn(
              'duration-[320ms] ease-[cubic-bezier(.22,1,.36,1)] object-cover transition-transform',
              'outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10',
              'md:group-hover:scale-[1.04] motion-reduce:md:group-hover:scale-100'
            )}
          />
        ) : (
          /* Photo-less fallback — a garment-themed tile so a card still reads. */
          <div
            className="flex h-full w-full flex-col items-center justify-center bg-cream-soft"
            style={{
              backgroundImage: 'radial-gradient(rgba(209,0,108,0.06) 1.2px, transparent 1.2px)',
              backgroundSize: '16px 16px',
            }}
          >
            <Shirt className="size-11 text-ink/25" strokeWidth={1.25} aria-hidden="true" />
          </div>
        )}

        {/* Garment-type chip — always visible so the piece TYPE reads at a glance */}
        <span
          className={cn(
            'absolute left-3 top-3 inline-flex items-center gap-1.5',
            'rounded-full border border-ink/10 bg-cream/95 px-2.5 py-1 backdrop-blur',
            'text-[11px] font-semibold uppercase tracking-[0.06em] text-ink'
          )}
        >
          {garmentLabel}
        </span>
      </div>

      {/* Body */}
      <div className="px-[18px] py-4 pb-5">
        {product.vendor?.business_name && (
          <p
            className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-indigo"
            translate="no"
          >
            <span className="truncate">{product.vendor.business_name}</span>
            {product.vendor.verified && (
              <BadgeCheck
                className="size-3.5 shrink-0 text-indigo"
                strokeWidth={2}
                aria-label="Verified vendor"
              />
            )}
          </p>
        )}
        <h3
          className="mb-2 font-display text-[21px] font-bold leading-[1.18] tracking-[-0.014em] text-ink"
          translate="no"
        >
          {product.title}
        </h3>
        {price && (
          <p className="mt-3 text-[14px] font-semibold tabular-nums text-ink">
            {hasUpsell && <span className="text-[12px] font-normal text-ink-muted">From </span>}
            {price}
          </p>
        )}
        {madeToMeasure && (
          <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-indigo">
            Made to measure
          </p>
        )}
      </div>
    </Link>
  );
}
