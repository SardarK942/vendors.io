'use client';

import * as React from 'react';
import { LayoutGrid } from 'lucide-react';
import { cn, VENDOR_CATEGORIES } from '@/lib/utils';
import { getCategoryIcon, getCategoryShortLabel } from '@/lib/vendor-category-visual';
import { useFilterState } from './use-filter-state';

/**
 * Airbnb-style category selector: a horizontal strip of category glyphs the user
 * taps to filter, instead of a dropdown. Writes the same `?category=` param the
 * old Category chip did. Clicking the active category clears it (back to All).
 */
export function CategoryIconBar() {
  const { state, apply } = useFilterState();
  const active = state.category;

  const items = [
    { slug: null as string | null, label: 'All', Icon: LayoutGrid },
    ...VENDOR_CATEGORIES.map((slug) => ({
      slug: slug as string | null,
      label: getCategoryShortLabel(slug),
      Icon: getCategoryIcon(slug),
    })),
  ];

  return (
    <div
      role="group"
      aria-label="Filter by category"
      className="flex gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {items.map(({ slug, label, Icon }) => {
        const isActive = active === slug || (slug === null && !active);
        return (
          <button
            key={slug ?? 'all'}
            type="button"
            aria-pressed={isActive}
            onClick={() => apply({ category: isActive ? null : slug, subcategories: [] })}
            className={cn(
              'flex shrink-0 flex-col items-center gap-1.5 border-b-2 px-3 pb-2 pt-1',
              'transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream',
              isActive
                ? 'border-ink text-ink'
                : 'border-transparent text-ink-muted hover:border-hot-pink/40 hover:text-hot-pink'
            )}
          >
            <Icon className="size-5" strokeWidth={1.75} aria-hidden="true" />
            <span className="whitespace-nowrap text-[11px] font-medium tracking-wide">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
