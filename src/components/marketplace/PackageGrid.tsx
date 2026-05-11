'use client';

import { useState } from 'react';
import Image from 'next/image';
import { PackageDetailModal } from './PackageDetailModal';

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

interface Props {
  packages: PackageWithAddons[];
  vendorSlug: string;
}

/**
 * Layout C — photo-forward package grid.
 * 3 columns desktop, 2 tablet, 1 mobile.
 * Cards open PackageDetailModal with addon toggles and live total.
 */
export function PackageGrid({ packages, vendorSlug }: Props) {
  const [selected, setSelected] = useState<PackageWithAddons | null>(null);

  if (packages.length === 0) return null;

  return (
    <>
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {packages.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setSelected(p)}
            className="text-left rounded-xl overflow-hidden border border-border hover:shadow-lg transition-shadow group"
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
            <div className="p-4 space-y-2">
              <h3 className="font-semibold text-base leading-tight">{p.name}</h3>
              <p className="text-sm text-muted-foreground">
                {p.duration_hours}h · up to {p.max_guests} guests
                {p.events_count > 1 && ` · ${p.events_count} events`}
              </p>
              <div className="flex justify-between items-center pt-1">
                <span className="font-bold text-lg">
                  ${(p.base_price_cents / 100).toLocaleString()}
                </span>
                <span className="text-sm text-primary group-hover:underline">Select →</span>
              </div>
            </div>
          </button>
        ))}
      </div>

      {selected && (
        <PackageDetailModal
          pkg={selected}
          vendorSlug={vendorSlug}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}

export default PackageGrid;
