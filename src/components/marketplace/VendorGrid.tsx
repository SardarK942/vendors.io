'use client';

import * as React from 'react';
import { VendorCard, type VendorCardProps } from './VendorCard';
import { Skeleton } from '@/components/ui/skeleton';

type VendorWithEnrichments = VendorCardProps['vendor'];

interface VendorGridProps {
  vendors: VendorWithEnrichments[];
  /** Optional — passed through from /vendors page when ?date= is in URL. */
  searchDate?: string;
}

export function VendorGrid({ vendors, searchDate }: VendorGridProps) {
  // Local save-state Set keyed by vendor.id. Lost on page navigation.
  // Follow-up PR will replace with persisted state from /api/users/me/saved.
  const [savedSet, setSavedSet] = React.useState<Set<string>>(new Set());

  const toggleSave = React.useCallback((vendorId: string, next: boolean) => {
    setSavedSet((prev) => {
      const updated = new Set(prev);
      if (next) updated.add(vendorId);
      else updated.delete(vendorId);
      return updated;
    });
  }, []);

  if (vendors.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-lg font-medium text-ink">No vendors found</p>
        <p className="mt-1 text-sm text-ink-muted">Try adjusting your filters or search terms.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {vendors.map((vendor) => (
        <VendorCard
          key={vendor.id}
          vendor={vendor}
          searchDate={searchDate}
          isSaved={savedSet.has(vendor.id)}
          onSaveToggle={(next) => toggleSave(vendor.id, next)}
        />
      ))}
    </div>
  );
}

export function VendorGridSkeleton() {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-lg border border-hairline bg-cream">
          <Skeleton className="aspect-[4/5] w-full" />
          <div className="space-y-2 p-[18px]">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-5 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
