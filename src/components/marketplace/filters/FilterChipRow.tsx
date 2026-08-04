'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Chip } from './Chip';
import { CategoryDropdown } from './CategoryDropdown';
import { PriceDropdown } from './PriceDropdown';
import { LanguagesDropdown } from './LanguagesDropdown';
import { PRICE_BANDS } from './constants';
import { useFilterState, type FilterDropdown } from './use-filter-state';
import { VENDOR_CATEGORY_LABELS } from '@/lib/utils';
import { getSubcategoriesForCategory, SUBCATEGORY_SECTION_LABEL } from '@/lib/vendor-subcategories';

export interface FilterChipRowProps {
  /** Optional className override on the row wrapper. */
  className?: string;
  /** Called when user clicks "All filters" chip — parent opens the sheet. */
  onOpenSheet: () => void;
}

// Panel visuals match the previous hand-rolled AnchoredPanel: cream field,
// hairline border, soft ink shadow. Tailwind-merge inside PopoverContent's
// cn() lets these override the shadcn defaults.
const PANEL_CLASSES = cn(
  'w-auto rounded-lg border border-hairline bg-cream p-2',
  'shadow-[0_12px_28px_rgba(27,20,20,0.10),_0_4px_8px_rgba(27,20,20,0.06)]'
);

/**
 * The horizontal chip row that lives in the sticky band on /vendors, immediately
 * below the search pill. Owns active-dropdown state + dispatches filter changes
 * (via the use-filter-state hook) which trigger URL updates + page re-fetch.
 *
 * Each dropdown chip is a controlled Radix Popover — Radix handles positioning,
 * click-outside, Esc, and focus management. Only-one-open is enforced by binding
 * every Popover's `open` to `activeDropdown === X`; opening one flips the others
 * closed on re-render.
 */
export function FilterChipRow({ className, onOpenSheet }: FilterChipRowProps) {
  const { state, patch, activeDropdown, setActiveDropdown, apply } = useFilterState();
  const searchParams = useSearchParams();
  const activeCategory = searchParams.get('category');
  const categoryHasSubs = getSubcategoriesForCategory(activeCategory).length > 0;
  const subcatCount = state.subcategories.length;

  // Commit pending language changes to URL when the Languages dropdown closes.
  // (Languages is multi-select; toggling chips uses patch() during the dropdown
  // session to avoid re-fetching after every click. On close, push to URL.)
  // Fire whenever languages WAS active and is NO LONGER active — regardless of
  // what dropdown opens next (e.g. Languages → Price must not lose the patch).
  const prevDropdownRef = React.useRef<FilterDropdown>(null);
  React.useEffect(() => {
    if (prevDropdownRef.current === 'languages' && activeDropdown !== 'languages') {
      apply();
    }
    prevDropdownRef.current = activeDropdown;
  }, [activeDropdown, apply]);

  const openHandler = (d: Exclude<FilterDropdown, null>) => (open: boolean) =>
    setActiveDropdown(open ? d : null);

  const priceBandLabel = state.priceBand
    ? `Price · ${PRICE_BANDS.find((b) => b.slug === state.priceBand)?.shorthand ?? ''}`
    : 'Price';
  const categoryLabel = state.category
    ? `Category · ${VENDOR_CATEGORY_LABELS[state.category] ?? state.category}`
    : 'Category';

  return (
    <div
      className={cn('relative flex items-center gap-2 overflow-x-auto py-1', className)}
      role="toolbar"
      aria-label="Filter vendors"
    >
      {/* Category — first chip, per product direction */}
      <Popover open={activeDropdown === 'category'} onOpenChange={openHandler('category')}>
        <PopoverTrigger asChild>
          <Chip variant="dropdown" isActive={activeDropdown === 'category' || !!state.category}>
            {categoryLabel}
          </Chip>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={8} className={PANEL_CLASSES}>
          <CategoryDropdown
            selected={state.category}
            onSelect={(c) => {
              apply({ category: c, subcategories: [] });
              setActiveDropdown(null);
            }}
          />
        </PopoverContent>
      </Popover>

      {/* Verified */}
      <Chip
        variant="toggle"
        isActive={state.verified}
        onClick={() => apply({ verified: !state.verified })}
      >
        Verified
      </Chip>

      {/* Responds < 24h */}
      <Chip
        variant="toggle"
        isActive={state.respondsIn === 24}
        onClick={() => apply({ respondsIn: state.respondsIn === 24 ? 0 : 24 })}
      >
        Responds &lt; 24h
      </Chip>

      {/* Price */}
      <Popover open={activeDropdown === 'price'} onOpenChange={openHandler('price')}>
        <PopoverTrigger asChild>
          <Chip variant="dropdown" isActive={activeDropdown === 'price' || !!state.priceBand}>
            {priceBandLabel}
          </Chip>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={8} className={PANEL_CLASSES}>
          <PriceDropdown
            selected={state.priceBand}
            onSelect={(b) => {
              apply({ priceBand: b });
              setActiveDropdown(null);
            }}
          />
        </PopoverContent>
      </Popover>

      {/* Languages */}
      <Popover open={activeDropdown === 'languages'} onOpenChange={openHandler('languages')}>
        <PopoverTrigger asChild>
          <Chip
            variant="dropdown"
            isActive={activeDropdown === 'languages' || state.languages.length > 0}
            count={state.languages.length}
          >
            Languages
          </Chip>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={8} className={PANEL_CLASSES}>
          <LanguagesDropdown
            selected={state.languages}
            onChange={(next) => patch({ languages: next })}
          />
        </PopoverContent>
      </Popover>

      {/* Active subcategory chip */}
      {categoryHasSubs && subcatCount > 0 && (
        <Chip
          variant="applied"
          count={subcatCount}
          onClick={onOpenSheet}
          onRemove={() => apply({ subcategories: [] })}
        >
          {(activeCategory && SUBCATEGORY_SECTION_LABEL[activeCategory]) || 'Type'}
        </Chip>
      )}

      {/* All filters trigger */}
      <Chip variant="all-filters" onClick={onOpenSheet}>
        All filters
      </Chip>
    </div>
  );
}
