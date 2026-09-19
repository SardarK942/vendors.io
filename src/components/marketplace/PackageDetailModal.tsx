'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import type { PackageWithAddons } from './PackageGrid';
import { PackagePhotoFallback } from './PackagePhotoFallback';
import { fmtUSD } from '@/lib/intl';
import { formatPackageMeta } from '@/types';
import { pricingUnitSuffix } from '@/lib/packages/archetypes';
import { getPackageAttributes } from '@/lib/packages/attributes';

// Humanize a snake_case attribute key when no category-labelled field list is
// in scope (the package row carries no category). e.g. "edited_photos" →
// "Edited photos". A best-effort fallback, not a lookup.
function humanizeKey(key: string): string {
  const spaced = key.replace(/_/g, ' ').trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : key;
}

// Turn the stored attributes bag into display rows. bool → label only when true;
// number/text → "Label: value". Empty/false values are dropped. When a vendor
// category is known, prefer its labelled field names (getPackageAttributes) for
// nicer labels (e.g. "# of photographers"); otherwise fall back to humanizing
// the snake_case key.
function attributeChips(
  attributes: Record<string, unknown> | null | undefined,
  category?: string
): string[] {
  if (!attributes) return [];
  const labelByKey = new Map(getPackageAttributes(category ?? '').map((f) => [f.key, f.label]));
  const rows: string[] = [];
  for (const [key, value] of Object.entries(attributes)) {
    if (value == null || value === false || value === '') continue;
    const label = labelByKey.get(key) ?? humanizeKey(key);
    rows.push(value === true ? label : `${label}: ${String(value)}`);
  }
  return rows;
}

interface Props {
  pkg: PackageWithAddons;
  vendorSlug: string;
  /** Vendor category — used to label attribute chips with category-specific
   * field names; empty/unknown falls back to humanized keys. */
  category?: string;
  onClose: () => void;
  interactive?: boolean;
}

/**
 * Package detail modal with:
 * - Full description + included items
 * - Add-on toggles with live total
 * - Gallery images
 * - vendor_notes_template preview
 * - "Continue to Booking" CTA → writes signed cookie + navigates to /book
 */
export function PackageDetailModal({
  pkg,
  vendorSlug,
  category,
  onClose,
  interactive = true,
}: Props) {
  const router = useRouter();
  const [toggled, setToggled] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const addonsTotal = pkg.addons
    .filter((a) => toggled.has(a.id))
    .reduce((sum, a) => sum + a.price_delta_cents, 0);
  const total = pkg.base_price_cents + addonsTotal;

  // Display-only pricing basis (e.g. " /guest"). Pre-migration rows → 'flat' → ''.
  const priceSuffix = pricingUnitSuffix(pkg.pricing_unit ?? 'flat');
  const detailChips = attributeChips(pkg.attributes, category);

  function toggleAddon(id: string) {
    setToggled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleContinue() {
    if (!interactive) {
      toast('Preview mode — bookings disabled.');
      return;
    }
    setLoading(true);
    const selectedAddons = pkg.addons
      .filter((a) => toggled.has(a.id))
      .map((a) => ({ addon_id: a.id, name: a.name, price_delta_cents: a.price_delta_cents }));

    try {
      const res = await fetch('/api/booking-selection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ package_id: pkg.id, selected_addons: selectedAddons }),
      });

      if (res.ok) {
        router.push(`/vendors/${vendorSlug}/book`);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle translate="no">{pkg.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Featured image */}
          <div className="relative aspect-[16/9] overflow-hidden rounded-xl bg-muted">
            {pkg.featured_image_url ? (
              <Image
                src={pkg.featured_image_url}
                alt={pkg.name}
                fill
                className="object-cover outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
                sizes="(max-width: 768px) 100vw, 672px"
              />
            ) : (
              <PackagePhotoFallback name={pkg.name} />
            )}
          </div>

          {/* Summary line */}
          {(() => {
            const metaLine = formatPackageMeta({
              durationHours: pkg.duration_hours,
              maxGuests: pkg.max_guests,
              capacityUnit: pkg.capacity_unit,
              eventsCount: pkg.events_count,
            });
            return metaLine ? (
              <p className="text-sm tabular-nums text-muted-foreground">{metaLine}</p>
            ) : null;
          })()}

          {/* Description */}
          <p className="text-sm">{pkg.description}</p>

          {/* Included items */}
          {pkg.included_items.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-semibold">What’s included</h4>
              <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                {pkg.included_items.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Details — populated attributes (category-specific inclusions) */}
          {detailChips.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-semibold">Details</h4>
              <ul className="flex flex-wrap gap-2">
                {detailChips.map((chip, idx) => (
                  <li
                    key={idx}
                    className="rounded-full border border-hairline bg-cream-soft px-2.5 py-1 text-xs text-ink"
                  >
                    {chip}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Gallery */}
          {pkg.gallery_image_urls.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {pkg.gallery_image_urls.map((url, idx) => (
                <div
                  key={idx}
                  className="relative aspect-[4/3] overflow-hidden rounded-lg bg-muted"
                >
                  <Image
                    src={url}
                    alt={`Gallery ${idx + 1}`}
                    fill
                    className="object-cover outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
                    sizes="50vw"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Add-ons */}
          {pkg.addons.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-semibold">Add-ons (optional)</h4>
              <div className="space-y-2">
                {pkg.addons.map((addon) => (
                  <label
                    key={addon.id}
                    className="flex min-h-10 cursor-pointer items-center justify-between gap-3 rounded-lg border p-3 transition-colors hover:bg-accent"
                  >
                    <span className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
                        checked={toggled.has(addon.id)}
                        onChange={() => toggleAddon(addon.id)}
                      />
                      <span className="text-sm">{addon.name}</span>
                    </span>
                    <span
                      className={`text-sm tabular-nums ${addon.price_delta_cents < 0 ? 'text-green-600' : ''}`}
                    >
                      {addon.price_delta_cents >= 0 ? '+' : ''}
                      {fmtUSD(addon.price_delta_cents)}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Vendor notes template preview */}
          {pkg.vendor_notes_template && (
            <div className="rounded-lg bg-muted p-3 text-xs italic text-muted-foreground">
              <strong className="font-semibold not-italic text-foreground">
                After booking, vendor will send:
              </strong>{' '}
              {pkg.vendor_notes_template}
            </div>
          )}

          <Separator />

          {/* Footer: total + CTA */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-xl font-bold tabular-nums">
                {fmtUSD(total)}
                <span className="text-sm font-normal text-muted-foreground">{priceSuffix}</span>
              </p>
            </div>
            <Button onClick={handleContinue} disabled={loading} size="lg">
              {loading ? 'Please wait…' : 'Continue to Booking'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default PackageDetailModal;
