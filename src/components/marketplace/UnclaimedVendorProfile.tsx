'use client';
import { useState } from 'react';
import { VENDOR_CATEGORY_LABELS } from '@/lib/utils';
import type { UnclaimedVendor } from '@/lib/scraped-vendor/public';

interface Props {
  vendor: UnclaimedVendor;
  onOpenOwnership: () => void;
  onIgClick: () => void;
}

export function UnclaimedVendorProfile({ vendor, onOpenOwnership, onIgClick }: Props) {
  const [igRevealed, setIgRevealed] = useState(false);
  const categoryLabel =
    (vendor.category && (VENDOR_CATEGORY_LABELS as Record<string, string>)[vendor.category]) ||
    vendor.category ||
    'Vendor';

  function handleIgClick() {
    onIgClick();
    setIgRevealed(true);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-8">
      <div className="rounded-lg border bg-muted/30 p-4 text-sm">
        <p className="font-medium">Unclaimed listing</p>
        <p className="text-muted-foreground">
          This vendor hasn’t joined Baazar yet. Booking will be available after they claim this
          listing.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_2fr]">
        <div className="aspect-[4/5] overflow-hidden rounded-lg bg-muted">
          {vendor.photos[0] ? (
            // eslint-disable-next-line @next/next/no-img-element -- scraped photos pre-claim; w/h reserves the 4/5 box and prevents CLS
            <img
              src={vendor.photos[0]}
              alt={vendor.business_name}
              width={400}
              height={500}
              loading="lazy"
              className="h-full w-full object-cover outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
              No photo
            </div>
          )}
        </div>

        <div className="space-y-3">
          <h1 className="text-balance text-2xl font-semibold" translate="no">
            {vendor.business_name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {categoryLabel}
            {vendor.city ? ` · ${vendor.city}, ${vendor.state}` : ''}
          </p>
          {vendor.bio && <p className="text-pretty text-sm">{vendor.bio}</p>}

          {vendor.instagram_handle && (
            <div>
              {igRevealed ? (
                <a
                  href={`https://instagram.com/${vendor.instagram_handle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-foreground underline"
                >
                  <span translate="no">@{vendor.instagram_handle}</span>
                </a>
              ) : (
                <button
                  type="button"
                  onClick={handleIgClick}
                  className="rounded-md border bg-background px-3 py-1.5 text-sm font-medium transition-[transform,background-color] hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream active:scale-[0.96] motion-reduce:active:scale-100"
                >
                  Show on Instagram
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-lg border p-4">
        <p className="mb-3 font-medium">Are you the owner?</p>
        <button
          type="button"
          onClick={onOpenOwnership}
          className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-cream transition-[transform,opacity] hover:opacity-90 active:scale-[0.96] motion-reduce:active:scale-100"
        >
          I own this business
        </button>
      </div>
    </div>
  );
}
