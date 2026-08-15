'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { PackageDetailModal } from './PackageDetailModal';
import { PackagePhotoFallback } from './PackagePhotoFallback';
import type { CustomRequestPackage } from '@/lib/vendor-packages/with-custom-request';
import { fmtUSD } from '@/lib/intl';

export interface PackageWithAddons {
  id: string;
  name: string;
  description: string;
  base_price_cents: number;
  duration_hours: number;
  max_guests: number;
  events_count: number;
  featured_image_url: string | null;
  gallery_image_urls: string[];
  included_items: string[];
  vendor_notes_template: string | null;
  location_mode: 'couple_provides' | 'at_vendor';
  addons: {
    id: string;
    name: string;
    price_delta_cents: number;
  }[];
}

type PackageItem = PackageWithAddons | CustomRequestPackage;

interface Props {
  packages: PackageItem[];
  vendorSlug: string;
  interactive?: boolean;
  featuredPackageId?: string;
  onRequestCustomQuote?: () => void;
}

function isCustom(p: PackageItem): p is CustomRequestPackage {
  return (p as CustomRequestPackage).is_custom === true;
}

/**
 * Layout C — photo-forward package grid.
 * 3 columns desktop, 2 tablet, 1 mobile.
 * Real packages open PackageDetailModal. Custom Request (virtual, always last)
 * opens the quote-request modal via onRequestCustomQuote when provided;
 * otherwise it falls back to a plain navigation to /vendors/{slug}/request.
 */
export function PackageGrid({
  packages,
  vendorSlug,
  interactive = true,
  featuredPackageId,
  onRequestCustomQuote,
}: Props) {
  const [selected, setSelected] = useState<PackageWithAddons | null>(null);
  const reducedMotion = useReducedMotion();
  const badgeSpring = reducedMotion
    ? { duration: 0 }
    : { type: 'spring' as const, duration: 0.3, bounce: 0 };

  if (packages.length === 0) return null;

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {packages.map((p) =>
          isCustom(p) ? (
            <Link
              key={p.id}
              href={`/vendors/${vendorSlug}/request`}
              onClick={(e) => {
                if (!interactive) {
                  e.preventDefault();
                  toast('Preview mode — bookings disabled.');
                  return;
                }
                if (onRequestCustomQuote) {
                  e.preventDefault();
                  onRequestCustomQuote();
                }
              }}
              className="group flex flex-col overflow-hidden rounded-xl border border-dashed border-ink-soft/60 bg-cream-soft text-left transition-[border-color,box-shadow] hover:border-indigo hover:shadow-md"
            >
              {/* Intentional panel — a custom quote has no photo by nature, so
                  this reads as bespoke rather than a missing image. */}
              <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2.5 bg-[radial-gradient(circle_at_center,rgba(46,61,163,0.05),transparent_70%)]">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-cream text-indigo ring-1 ring-hairline">
                  <Sparkles className="size-5" aria-hidden="true" />
                </span>
                <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink-soft">
                  Tailored
                </span>
              </div>
              <div className="flex flex-1 flex-col p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-hot-pink">
                  Quote on request
                </p>
                <h3
                  className="mt-1.5 text-base font-semibold leading-tight text-ink"
                  translate="no"
                >
                  {p.name}
                </h3>
                <p className="mt-1.5 flex-1 text-sm leading-relaxed text-ink-muted">
                  {p.description}
                </p>
                {/* Stacked footer — never a justify-between row, which wraps and
                    misaligns in a ~210px column. */}
                <div className="mt-4 border-t border-hairline pt-4">
                  <p className="font-display text-lg italic text-ink">Custom pricing</p>
                  <p className="mt-0.5 text-xs text-ink-soft">
                    Quoted once the vendor sees your request
                  </p>
                  <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-indigo transition-[gap] group-hover:gap-2.5">
                    Request a quote
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </span>
                </div>
              </div>
            </Link>
          ) : (
            <div
              key={p.id}
              className="relative"
              data-pkg-featured={p.id === featuredPackageId ? 'true' : undefined}
            >
              <AnimatePresence initial={false}>
                {p.id === featuredPackageId && (
                  <motion.span
                    key="most-popular"
                    initial={{ scale: 0.25, opacity: 0, filter: 'blur(4px)' }}
                    animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    transition={badgeSpring}
                    className="absolute -top-2.5 left-4 z-10 rounded-full bg-hot-pink px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-cream"
                  >
                    Most popular
                  </motion.span>
                )}
              </AnimatePresence>
              <button
                type="button"
                onClick={() => {
                  if (!interactive) {
                    toast('Preview mode — bookings disabled.');
                    return;
                  }
                  setSelected(p);
                }}
                className={`group w-full overflow-hidden rounded-xl text-left transition-[transform,box-shadow] hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream active:scale-[0.98] motion-reduce:active:scale-100 ${
                  p.id === featuredPackageId
                    ? 'shadow-[0_0_0_2px_rgb(27_20_20),0_1px_2px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.08)]'
                    : 'border border-border'
                }`}
              >
                <div className="relative aspect-[4/3] bg-muted">
                  {p.featured_image_url ? (
                    <Image
                      src={p.featured_image_url}
                      alt={p.name}
                      fill
                      className="object-cover outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    />
                  ) : (
                    <PackagePhotoFallback name={p.name} />
                  )}
                </div>
                <div className="space-y-2 p-4">
                  <h3 className="text-base font-semibold leading-tight" translate="no">
                    {p.name}
                  </h3>
                  <p className="text-sm tabular-nums text-muted-foreground">
                    {p.duration_hours}
                    {' '}h · up to {p.max_guests} guests
                    {p.events_count > 1 && ` · ${p.events_count} events`}
                  </p>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-lg font-bold tabular-nums">
                      {fmtUSD(p.base_price_cents)}
                    </span>
                    <span className="inline-flex items-center gap-1 text-sm text-primary group-hover:underline">
                      Book
                      <ArrowRight className="size-4 translate-y-px" aria-hidden="true" />
                    </span>
                  </div>
                </div>
              </button>
            </div>
          )
        )}
      </div>

      {selected && (
        <PackageDetailModal
          pkg={selected}
          vendorSlug={vendorSlug}
          onClose={() => setSelected(null)}
          interactive={interactive}
        />
      )}
    </>
  );
}

export default PackageGrid;
