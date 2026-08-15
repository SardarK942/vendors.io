'use client';

import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import { PackagePhotoFallback } from '@/components/marketplace/PackagePhotoFallback';
import { fmtUSD } from '@/lib/intl';
import { formatCapacity, type PackageCapacityUnitInput } from '@/types';

export interface PackagePreviewData {
  name: string;
  basePriceCents: number | null;
  maxGuests: number | null;
  capacityUnit: PackageCapacityUnitInput;
  durationHours: number | null;
  eventsCount: number;
  featuredImageUrl: string;
  isFeatured: boolean;
  includedCount: number;
  addonCount: number;
}

/**
 * A faithful mirror of the customer-facing package card (see PackageGrid's
 * real-package tile), rendered live as the vendor edits. It is intentionally
 * non-interactive — it exists so the vendor sees exactly what a couple will
 * see, the same live-preview pattern the onboarding wizard uses.
 */
export function PackageLivePreview({ data }: { data: PackagePreviewData }) {
  const name = data.name.trim() || 'Your package name';
  const hasPrice = data.basePriceCents != null && data.basePriceCents > 0;

  return (
    <div className="space-y-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft">
        Live preview
      </p>

      <div className="relative">
        {data.isFeatured && (
          <span className="absolute -top-2.5 left-4 z-10 rounded-full bg-hot-pink px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-cream">
            Most popular
          </span>
        )}
        <div
          className={`w-full overflow-hidden rounded-xl text-left ${
            data.isFeatured
              ? 'shadow-[0_0_0_2px_rgb(27_20_20),0_1px_2px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.08)]'
              : 'border border-border'
          }`}
        >
          <div className="relative aspect-[4/3] bg-muted">
            {data.featuredImageUrl ? (
              <Image
                src={data.featuredImageUrl}
                alt={name}
                fill
                className="object-cover outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
                sizes="360px"
              />
            ) : (
              <PackagePhotoFallback name={name} />
            )}
          </div>
          <div className="space-y-2 p-4">
            <h3 className="text-base font-semibold leading-tight" translate="no">
              {name}
            </h3>
            <p className="text-sm tabular-nums text-muted-foreground">
              {data.durationHours ? `${data.durationHours} h · ` : ''}
              {data.maxGuests ? formatCapacity(data.maxGuests, data.capacityUnit) : 'capacity —'}
              {data.eventsCount > 1 ? ` · ${data.eventsCount} events` : ''}
            </p>
            <div className="flex items-center justify-between pt-1">
              <span className="text-lg font-bold tabular-nums">
                {hasPrice ? fmtUSD(data.basePriceCents!) : '$—'}
              </span>
              <span className="inline-flex items-center gap-1 text-sm text-primary">
                Book
                <ArrowRight className="size-4 translate-y-px" aria-hidden="true" />
              </span>
            </div>
          </div>
        </div>
      </div>

      <p className="text-xs text-ink-soft">
        {data.includedCount > 0
          ? `${data.includedCount} included item${data.includedCount === 1 ? '' : 's'}`
          : 'No included items yet'}
        {data.addonCount > 0
          ? ` · ${data.addonCount} add-on${data.addonCount === 1 ? '' : 's'}`
          : ''}
      </p>
    </div>
  );
}
