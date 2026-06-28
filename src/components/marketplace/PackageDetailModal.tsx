'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import type { PackageWithAddons } from './PackageGrid';

interface Props {
  pkg: PackageWithAddons;
  vendorSlug: string;
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
export function PackageDetailModal({ pkg, vendorSlug, onClose, interactive = true }: Props) {
  const router = useRouter();
  const [toggled, setToggled] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const addonsTotal = pkg.addons
    .filter((a) => toggled.has(a.id))
    .reduce((sum, a) => sum + a.price_delta_cents, 0);
  const total = pkg.base_price_cents + addonsTotal;

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
          <DialogTitle>{pkg.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Featured image */}
          <div className="relative aspect-[16/9] overflow-hidden rounded-lg bg-muted">
            <Image
              src={pkg.featured_image_url}
              alt={pkg.name}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 672px"
            />
          </div>

          {/* Summary line */}
          <p className="text-sm text-muted-foreground">
            {pkg.duration_hours}
            {' '}h · up to {pkg.max_guests} guests
            {pkg.events_count > 1 && ` · ${pkg.events_count} events`}
          </p>

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

          {/* Gallery */}
          {pkg.gallery_image_urls.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {pkg.gallery_image_urls.map((url, idx) => (
                <div key={idx} className="relative aspect-[4/3] overflow-hidden rounded bg-muted">
                  <Image
                    src={url}
                    alt={`Gallery ${idx + 1}`}
                    fill
                    className="object-cover"
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
                    className="flex cursor-pointer items-center justify-between rounded-lg border p-3 transition-colors hover:bg-accent"
                  >
                    <span className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        className="rounded"
                        checked={toggled.has(addon.id)}
                        onChange={() => toggleAddon(addon.id)}
                      />
                      <span className="text-sm">{addon.name}</span>
                    </span>
                    <span
                      className={`font-mono text-sm ${addon.price_delta_cents < 0 ? 'text-green-600' : ''}`}
                    >
                      {addon.price_delta_cents >= 0 ? '+' : ''}$
                      {(addon.price_delta_cents / 100).toLocaleString()}
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
              <p className="text-xl font-bold">${(total / 100).toLocaleString()}</p>
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
