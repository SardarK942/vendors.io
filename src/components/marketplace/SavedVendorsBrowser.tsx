'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { VendorGrid } from './VendorGrid';
import type { VendorCardProps } from './VendorCard';
import { cn, VENDOR_CATEGORY_LABELS } from '@/lib/utils';

type Vendor = VendorCardProps['vendor'];

/**
 * Client wrapper around VendorGrid for the Saved page: category filter chips
 * (only the categories actually present in the shortlist) that filter the grid
 * client-side. Chips are hidden when there is only one category to filter by.
 */
export function SavedVendorsBrowser({ vendors }: { vendors: Vendor[] }) {
  const [selected, setSelected] = useState<string | null>(null);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const v of vendors) if (v.category) set.add(v.category);
    return Array.from(set).sort((a, b) =>
      (VENDOR_CATEGORY_LABELS[a] ?? a).localeCompare(VENDOR_CATEGORY_LABELS[b] ?? b)
    );
  }, [vendors]);

  const filtered = useMemo(
    () => (selected ? vendors.filter((v) => v.category === selected) : vendors),
    [vendors, selected]
  );

  const showChips = categories.length > 1;

  return (
    <div className="space-y-5">
      {showChips && (
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Filter saved vendors by category"
        >
          <Chip active={selected === null} onClick={() => setSelected(null)}>
            All categories
          </Chip>
          {categories.map((c) => (
            <Chip key={c} active={selected === c} onClick={() => setSelected(c)}>
              {VENDOR_CATEGORY_LABELS[c] ?? c}
            </Chip>
          ))}
        </div>
      )}
      <VendorGrid vendors={filtered} />
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'border-indigo bg-indigo text-cream'
          : 'border-hairline bg-cream text-ink-soft hover:border-indigo/40 hover:text-ink'
      )}
    >
      {children}
    </button>
  );
}
