'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { toast } from 'sonner';
import { PackageDetailModal } from './PackageDetailModal';
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
  featured_image_url: string;
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
}

function isCustom(p: PackageItem): p is CustomRequestPackage {
  return (p as CustomRequestPackage).is_custom === true;
}

/**
 * Layout C — photo-forward package grid.
 * 3 columns desktop, 2 tablet, 1 mobile.
 * Real packages open PackageDetailModal. Custom Request (virtual, always last)
 * navigates directly to /vendors/{slug}/request (no intermediate modal).
 */
export function PackageGrid({
  packages,
  vendorSlug,
  interactive = true,
  featuredPackageId,
}: Props) {
  const [selected, setSelected] = useState<PackageWithAddons | null>(null);

  if (packages.length === 0) return null;

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {packages.map((p) =>
          isCustom(p) ? (
            <Link
              key={p.id}
              href={`/vendors/${vendorSlug}/request`}
              onClick={
                !interactive
                  ? (e) => {
                      e.preventDefault();
                      toast('Preview mode — bookings disabled.');
                    }
                  : undefined
              }
              className="group flex flex-col overflow-hidden rounded-xl border border-dashed border-ink-soft bg-cream-soft text-left transition-shadow hover:shadow-md"
            >
              <div className="flex aspect-[4/3] items-center justify-center bg-cream-soft">
                <span className="font-display text-5xl font-bold tracking-[-0.02em] text-ink-soft">
                  ?
                </span>
              </div>
              <div className="flex flex-1 flex-col space-y-2 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-hot-pink">
                  Quote on request
                </p>
                <h3 className="text-base font-semibold leading-tight text-ink" translate="no">
                  {p.name}
                </h3>
                <p className="flex-1 text-sm text-ink-muted">{p.description}</p>
                <div className="flex items-center justify-between pt-1">
                  <span className="font-display text-lg font-medium italic text-ink">
                    Custom
                    <span className="ml-1 text-xs not-italic text-ink-soft">
                      — price after vendor responds
                    </span>
                  </span>
                  <span className="text-sm text-indigo group-hover:underline">
                    Request a quote →
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
              {p.id === featuredPackageId && (
                <span className="absolute -top-2.5 left-4 z-10 rounded-full bg-hot-pink px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-cream">
                  Most popular
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  if (!interactive) {
                    toast('Preview mode — bookings disabled.');
                    return;
                  }
                  setSelected(p);
                }}
                className={`group w-full overflow-hidden rounded-xl text-left transition-shadow hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream ${
                  p.id === featuredPackageId ? 'border-2 border-ink' : 'border border-border'
                }`}
              >
                <div className="relative aspect-[4/3] bg-muted">
                  <Image
                    src={p.featured_image_url}
                    alt={p.name}
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  />
                </div>
                <div className="space-y-2 p-4">
                  <h3 className="text-base font-semibold leading-tight" translate="no">
                    {p.name}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {p.duration_hours}
                    {' '}h · up to {p.max_guests} guests
                    {p.events_count > 1 && ` · ${p.events_count} events`}
                  </p>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-lg font-bold tabular-nums">
                      {fmtUSD(p.base_price_cents)}
                    </span>
                    <span className="text-sm text-primary group-hover:underline">
                      Book <span translate="no">{p.name}</span> →
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
