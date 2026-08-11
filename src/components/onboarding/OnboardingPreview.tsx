'use client';
import { useState } from 'react';
import { X } from 'lucide-react';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { VendorCard } from '@/components/marketplace/VendorCard';
import { VendorProfile } from '@/components/marketplace/VendorProfile';
import type { Database } from '@/types/database.types';

type VendorRow = Database['public']['Tables']['vendor_profiles']['Row'];

interface Props {
  profile: VendorRow;
  /**
   * `panel` — the persistent right-column preview shown during the wizard.
   * `inline` — the compact click-to-expand card used inside the Review step.
   */
  variant?: 'panel' | 'inline';
}

/**
 * Live "how couples will see you" preview, reused by:
 *  - the focused wizard shell (persistent right column, `variant="panel"`)
 *  - the Review step (`variant="inline"`)
 *
 * Data comes from the last-saved vendor_profiles row, so the preview fills in
 * as the vendor advances through each step (updates on step-advance, v1).
 */
export function OnboardingPreview({ profile, variant = 'panel' }: Props) {
  const [previewOpen, setPreviewOpen] = useState(false);

  // VendorCard expects the marketplace row shape plus a price-band field.
  const previewVendor: VendorRow & { vendor_packages_price_band?: null } = {
    ...profile,
    vendor_packages_price_band: null,
  };

  // Nothing meaningful entered yet — show a calm placeholder rather than an
  // empty card so the panel never looks broken on Step 1.
  const isEmpty = !profile.business_name?.trim();

  // VendorCard is itself interactive (it contains a Link + a save button), so it
  // must NOT be wrapped in another button — that nests interactive elements and
  // trips a hydration error. The "full profile" dialog opens from a separate
  // link-styled trigger placed beneath the card instead.
  const card = (
    <div className="w-full max-w-xs space-y-2">
      <div className="overflow-hidden rounded-lg ring-1 ring-ink/10">
        <VendorCard vendor={previewVendor} />
      </div>
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogTrigger asChild>
          <button
            type="button"
            className="text-xs font-medium text-indigo underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
          >
            See full profile preview
          </button>
        </DialogTrigger>
        <DialogContent className="m-0 h-[100dvh] w-screen max-w-none rounded-none border-0 p-0 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-ink/15 bg-cream px-4 py-3">
            <p className="flex items-center gap-2 text-sm text-ink">
              <span className="size-2 rounded-full bg-hot-pink" />
              Preview — not yet published
            </p>
            <button
              type="button"
              onClick={() => setPreviewOpen(false)}
              aria-label="Close preview"
              className="flex size-10 items-center justify-center rounded-md text-ink hover:bg-ink/5"
            >
              <X className="size-5" />
            </button>
          </div>
          <div className="h-[calc(100vh-49px)] overflow-y-auto">
            <VendorProfile vendor={previewVendor} showBookingButton={false} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );

  if (variant === 'inline') {
    return card;
  }

  // Panel variant: labelled, sticky column for the wizard shell.
  return (
    <div className="space-y-3">
      <div>
        <p className="flex items-center gap-2 text-sm font-semibold text-ink">
          <span className="size-2 rounded-full bg-hot-pink" />
          Live preview
        </p>
        <p className="text-pretty text-xs text-ink/60">
          How couples will see you. Fills in as you go.
        </p>
      </div>
      {isEmpty ? (
        <div className="max-w-xs space-y-3 rounded-lg border border-dashed border-ink/20 bg-cream/40 p-4">
          <div className="aspect-[4/3] w-full rounded-md bg-ink/[0.06]" />
          <div className="h-4 w-2/3 rounded bg-ink/[0.06]" />
          <div className="h-3 w-1/3 rounded bg-ink/[0.06]" />
          <p className="text-pretty text-xs text-ink/50">
            Add your business name to start your listing.
          </p>
        </div>
      ) : (
        card
      )}
    </div>
  );
}
