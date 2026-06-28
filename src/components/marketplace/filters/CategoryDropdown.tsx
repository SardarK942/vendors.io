'use client';

import * as React from 'react';
import { cn, VENDOR_CATEGORIES, VENDOR_CATEGORY_LABELS } from '@/lib/utils';

export interface CategoryDropdownProps {
  /** Currently selected category slug, or null for unset. */
  selected: string | null;
  /** Called when user picks a category (or clears it). */
  onSelect: (category: string | null) => void;
}

/**
 * Category picker panel that docks below the Category chip in the chip row.
 * Single-select; tapping the active row clears the filter.
 */
export function CategoryDropdown({ selected, onSelect }: CategoryDropdownProps) {
  return (
    <ul role="listbox" aria-label="Vendor category" className="min-w-[220px] py-1">
      <li>
        <button
          type="button"
          role="option"
          aria-selected={selected === null}
          onClick={() => onSelect(null)}
          className={cn(
            'flex w-full items-center justify-between rounded-sm px-3 py-2 text-left text-[13px] text-ink transition-colors',
            'hover:bg-cream-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo',
            selected === null && 'bg-cream-soft font-medium'
          )}
        >
          All categories
        </button>
      </li>
      {VENDOR_CATEGORIES.map((slug) => {
        const isSelected = selected === slug;
        return (
          <li key={slug}>
            <button
              type="button"
              role="option"
              aria-selected={isSelected}
              onClick={() => onSelect(isSelected ? null : slug)}
              className={cn(
                'flex w-full items-center justify-between rounded-sm px-3 py-2 text-left text-[13px] text-ink transition-colors',
                'hover:bg-cream-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo',
                isSelected && 'bg-cream-soft font-medium'
              )}
            >
              <span>{VENDOR_CATEGORY_LABELS[slug] ?? slug}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
