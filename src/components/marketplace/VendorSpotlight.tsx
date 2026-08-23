import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { listUnclaimed } from '@/lib/scraped-vendor/public';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { VENDOR_CATEGORY_LABELS } from '@/lib/utils';
import { VendorSpotlightThumbs } from '@/components/marketplace/VendorSpotlightThumbs';

/**
 * Hand-picked homepage spotlight. Set to a LIVE vendor's slug to feature that
 * vendor; set to `null` to fall back to the rotating unclaimed-vendor spotlight.
 * To change or remove the spotlight, edit this one constant.
 */
const SPOTLIGHT_VENDOR_SLUG: string | null = 'pop-shop-034eb1';

interface SpotlightVendor {
  business_name: string;
  slug: string;
  category: string | null;
  photos: string[];
  city: string | null;
  state: string | null;
  /** true for the rotating unclaimed pick → "Featured vendor of the week". */
  ofTheWeek: boolean;
}

/**
 * The hand-picked live vendor named by SPOTLIGHT_VENDOR_SLUG. Returns null if
 * the slug is unset, the vendor isn't live, or it has no photo — so the caller
 * falls back to the unclaimed rotation and the section never renders empty.
 */
async function getFeaturedVendor(): Promise<SpotlightVendor | null> {
  if (!SPOTLIGHT_VENDOR_SLUG) return null;
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from('vendor_profiles')
    .select('business_name, slug, category, portfolio_images, base_city, base_state')
    .eq('slug', SPOTLIGHT_VENDOR_SLUG)
    .eq('is_active', true)
    .eq('onboarding_complete', true)
    .maybeSingle();
  if (!data || !data.slug || !data.portfolio_images?.[0]) return null;
  return {
    business_name: data.business_name,
    slug: data.slug,
    category: data.category,
    photos: data.portfolio_images,
    city: data.base_city,
    state: data.base_state,
    ofTheWeek: false,
  };
}

/**
 * The rotating "of the week" pick from the public unclaimed-listings pool
 * (`scraped_vendors` via listUnclaimed) — the original spotlight behaviour,
 * kept as the fallback. Deterministic weekly rotation. Null if none photographed.
 */
async function getUnclaimedVendor(): Promise<SpotlightVendor | null> {
  const vendors = await listUnclaimed({ limit: 48 });
  const withPhotos = vendors.filter((v) => v.photos?.[0]);
  if (withPhotos.length === 0) return null;

  const now = new Date();
  const weekIndex = Math.floor(
    (now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000)
  );
  const v = withPhotos[weekIndex % withPhotos.length];
  return {
    business_name: v.business_name,
    slug: v.slug,
    category: v.category,
    photos: v.photos,
    city: v.city,
    state: v.state,
    ofTheWeek: true,
  };
}

/**
 * "Vendor Spotlight" — H5 of the homepage. Prefers the hand-picked live vendor
 * (SPOTLIGHT_VENDOR_SLUG); falls back to the rotating unclaimed pick. Renders
 * nothing if neither is available, so the page degrades cleanly. No
 * rating/review data is shown for unclaimed rows (never fabricated).
 */
export async function VendorSpotlight() {
  const vendor = (await getFeaturedVendor()) ?? (await getUnclaimedVendor());
  if (!vendor) return null;

  const categoryLabel =
    (vendor.category && (VENDOR_CATEGORY_LABELS as Record<string, string>)[vendor.category]) ||
    vendor.category ||
    'Vendor';
  const location = [vendor.city, vendor.state].filter(Boolean).join(', ');
  const thumbs = vendor.photos.slice(1, 5);

  return (
    <section className="mx-auto max-w-[1200px] px-6 py-8 lg:px-14 lg:py-10">
      <div className="overflow-hidden rounded-[24px] bg-ink text-cream">
        <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_1fr]">
          {/* Hero photo (plain img — vendor/scraped photos come from varied hosts) */}
          <div className="relative min-h-[280px] bg-ink-soft/30 lg:min-h-[440px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={vendor.photos[0]}
              alt={vendor.business_name}
              className="absolute inset-0 h-full w-full object-cover"
            />
          </div>

          {/* Content */}
          <div className="flex flex-col justify-center gap-5 p-8 lg:p-12">
            <div>
              <p className="m-0 mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-hot-pink">
                Vendor spotlight
              </p>
              <p className="m-0 text-sm text-cream/70">
                {vendor.ofTheWeek ? 'Featured vendor of the week' : 'Featured vendor'}
              </p>
            </div>

            <h2
              className="m-0 font-serif font-bold leading-[1.05] tracking-[-0.02em]"
              style={{ fontSize: 'clamp(30px, 3.4vw, 46px)' }}
            >
              {vendor.business_name}
            </h2>

            <p className="m-0 text-base text-cream/80">
              {categoryLabel}
              {location ? ` · ${location}` : ''}
            </p>

            {thumbs.length > 0 && <VendorSpotlightThumbs srcs={thumbs} />}

            <div className="mt-1">
              <Link
                href={`/vendors/${vendor.slug}`}
                className="inline-flex items-center gap-2 rounded-xl bg-hot-pink px-5 py-3 text-sm font-semibold text-cream transition-colors hover:bg-hot-pink/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hot-pink focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
              >
                View profile <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
