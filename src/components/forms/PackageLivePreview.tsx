'use client';

import Image from 'next/image';
import { ArrowRight, Eye } from 'lucide-react';
import { PackagePhotoFallback } from '@/components/marketplace/PackagePhotoFallback';
import { fmtUSD } from '@/lib/intl';
import { formatPackageMeta, type PackageCapacityUnitInput } from '@/types';

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
 * The live "how couples will see you" rail card. A faithful mirror of the
 * customer-facing package card, rendered live as the vendor edits — each field
 * fills in as it's typed, and empty fields show a placeholder bar. Intentionally
 * non-interactive. Chrome follows the dashboard redesign (Figma 47:267).
 */
export function PackageLivePreview({ data }: { data: PackagePreviewData }) {
  const name = data.name.trim();
  const hasName = name.length > 0;
  const hasPrice = data.basePriceCents != null && data.basePriceCents > 0;
  const metaLine = formatPackageMeta({
    durationHours: data.durationHours,
    maxGuests: data.maxGuests,
    capacityUnit: data.capacityUnit,
    eventsCount: data.eventsCount,
  });

  return (
    <div className="space-y-4 rounded-2xl border border-hairline bg-cream-soft/40 p-4">
      {/* Heading */}
      <div className="flex items-start gap-2.5">
        <Eye className="mt-0.5 size-[18px] shrink-0 text-indigo" aria-hidden="true" />
        <div className="space-y-0.5">
          <p className="text-xs font-semibold leading-none text-ink">Live preview</p>
          <p className="text-[11px] leading-snug text-ink-soft">
            How couples will see you. Fills in as you go.
          </p>
        </div>
      </div>

      {/* Listing mirror */}
      <div className="relative">
        {data.isFeatured && (
          <span className="absolute -top-2.5 left-4 z-10 rounded-full bg-hot-pink px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-cream">
            Most popular
          </span>
        )}
        <div className="overflow-hidden rounded-xl border border-hairline bg-cream">
          <div className="relative aspect-[16/10] bg-muted">
            {data.featuredImageUrl ? (
              <Image
                src={data.featuredImageUrl}
                alt={hasName ? name : 'Package preview'}
                fill
                className="object-cover outline outline-1 -outline-offset-1 outline-black/10"
                sizes="326px"
              />
            ) : (
              <PackagePhotoFallback name={hasName ? name : 'Your package'} />
            )}
          </div>

          <div className="space-y-2 p-3.5">
            {/* Name — real or placeholder bar */}
            {hasName ? (
              <h3 className="text-sm font-semibold leading-tight text-ink" translate="no">
                {name}
              </h3>
            ) : (
              <div className="h-3 w-40 rounded bg-cream-soft" aria-hidden="true" />
            )}

            {/* Meta — real or placeholder bar */}
            {metaLine ? (
              <p className="text-xs tabular-nums text-ink-soft">{metaLine}</p>
            ) : (
              <div className="h-2 w-24 rounded bg-cream-soft" aria-hidden="true" />
            )}

            {/* Content chips (indigo pills, per the redesign) */}
            {(data.includedCount > 0 || data.addonCount > 0) && (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {data.includedCount > 0 && (
                  <span className="rounded-full bg-indigo/10 px-2 py-0.5 text-[10px] font-medium text-indigo">
                    {data.includedCount} included
                  </span>
                )}
                {data.addonCount > 0 && (
                  <span className="rounded-full bg-indigo/10 px-2 py-0.5 text-[10px] font-medium text-indigo">
                    {data.addonCount} add-on{data.addonCount === 1 ? '' : 's'}
                  </span>
                )}
              </div>
            )}

            {/* Price + Book */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-base font-bold tabular-nums text-ink">
                {hasPrice ? fmtUSD(data.basePriceCents!) : '$—'}
              </span>
              <span className="inline-flex items-center gap-1 text-sm text-indigo">
                Book
                <ArrowRight className="size-4 translate-y-px" aria-hidden="true" />
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Empty-state prompt */}
      {!hasName && (
        <div className="border-t border-hairline pt-3.5">
          <p className="text-[11px] text-ink-soft">Add your package name to start your listing.</p>
        </div>
      )}
    </div>
  );
}
