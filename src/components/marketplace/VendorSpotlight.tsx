import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { listUnclaimed } from '@/lib/scraped-vendor/public';
import { VENDOR_CATEGORY_LABELS } from '@/lib/utils';

/**
 * "Vendor Spotlight — Featured Vendor of the Week" — H5 of the homepage Figma
 * redesign (frame 113:86).
 *
 * Sources a REAL vendor from the public unclaimed-listings pool
 * (`scraped_vendors` via the SECURITY DEFINER RPC in listUnclaimed). Those rows
 * carry a real business name, category, city and photos — but NO rating/review
 * data, so no rating is shown (never fabricated). A deterministic weekly pick
 * keeps the "of the week" framing stable within a week. Renders nothing if no
 * photographed vendor is available (e.g. an empty dev DB), so the page degrades
 * cleanly. Featuring an unclaimed listing also nudges "I own this business"
 * claims. Category label via VENDOR_CATEGORY_LABELS.
 */
export async function VendorSpotlight() {
  const vendors = await listUnclaimed({ limit: 48 });
  const withPhotos = vendors.filter((v) => v.photos?.[0]);
  if (withPhotos.length === 0) return null;

  // Deterministic "of the week" rotation: same vendor for the whole ISO-ish week.
  const now = new Date();
  const weekIndex = Math.floor(
    (now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000)
  );
  const vendor = withPhotos[weekIndex % withPhotos.length];

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
          {/* Hero photo (plain img — scraped photos come from varied hosts) */}
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
              <p className="m-0 text-sm text-cream/70">Featured vendor of the week</p>
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

            {thumbs.length > 0 && (
              <ul className="m-0 flex list-none gap-2 p-0">
                {thumbs.map((src, i) => (
                  <li key={i} className="size-16 overflow-hidden rounded-lg bg-ink-soft/40">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" className="h-full w-full object-cover" />
                  </li>
                ))}
              </ul>
            )}

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
