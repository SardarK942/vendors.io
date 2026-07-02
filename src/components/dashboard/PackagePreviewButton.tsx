'use client';

import { useState } from 'react';
import { Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PackageDetailModal } from '@/components/marketplace/PackageDetailModal';
import type { PackageWithAddons } from '@/components/marketplace/PackageGrid';

interface Props {
  pkg: PackageWithAddons;
  vendorSlug: string;
}

/**
 * Vendor-side "Preview" button that opens the same PackageDetailModal a
 * customer sees, in interactive={false} mode. Booking CTA becomes a no-op
 * toast so the vendor can safely inspect the modal without triggering a
 * booking flow.
 */
export function PackagePreviewButton({ pkg, vendorSlug }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Eye className="mr-1 size-4" aria-hidden="true" />
        Preview
      </Button>
      {open && (
        <PackageDetailModal
          pkg={pkg}
          vendorSlug={vendorSlug}
          interactive={false}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
