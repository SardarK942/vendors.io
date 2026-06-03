'use client';
import { useEffect, useState } from 'react';
import { UnclaimedVendorProfile } from './UnclaimedVendorProfile';
import { OwnThisBusinessModal } from './OwnThisBusinessModal';
import type { UnclaimedVendor } from '@/lib/scraped-vendor/public';

interface Props {
  vendor: UnclaimedVendor;
}

export function UnclaimedVendorRoute({ vendor }: Props) {
  const [ownershipOpen, setOwnershipOpen] = useState(false);

  // Fire view event on mount (fire-and-forget; daily dedup handled server-side).
  useEffect(() => {
    fetch(`/api/scraped-vendors/${vendor.id}/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'view' }),
    }).catch(() => {
      // engagement is fire-and-forget; surface in console for local debugging only
    });
  }, [vendor.id]);

  function handleIgClick() {
    fetch(`/api/scraped-vendors/${vendor.id}/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'ig_click' }),
    }).catch(() => {});
  }

  return (
    <>
      <UnclaimedVendorProfile
        vendor={vendor}
        onOpenOwnership={() => setOwnershipOpen(true)}
        onIgClick={handleIgClick}
      />
      <OwnThisBusinessModal
        open={ownershipOpen}
        vendorId={vendor.id}
        businessName={vendor.business_name}
        onClose={() => setOwnershipOpen(false)}
      />
    </>
  );
}
