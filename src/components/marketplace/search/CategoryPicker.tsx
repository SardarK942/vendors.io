'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { CATEGORIES } from './categories';

export interface CategoryPickerProps {
  /** Currently selected category slug. Empty string or 'all' = no filter. */
  selected: string;
  /** Called when user picks a category. Receives the slug. */
  onSelect: (slug: string) => void;
}

/**
 * Vertical list of vendor categories with icons. Single-select.
 * Renders inside a panel docked below the Category segment.
 */
export function CategoryPicker({ selected, onSelect }: CategoryPickerProps) {
  return (
    <ul
      role="listbox"
      aria-label="Vendor category"
      className="max-h-80 space-y-0.5 overflow-y-auto"
    >
      {CATEGORIES.map((cat) => {
        const isSelected = selected === cat.slug || (!selected && cat.slug === 'all');
        const Icon = cat.icon;
        return (
          <li key={cat.slug}>
            <button
              type="button"
              role="option"
              aria-selected={isSelected}
              onClick={() => onSelect(cat.slug)}
              className={cn(
                'flex w-full items-center gap-3 rounded-sm px-3 py-2.5 text-left',
                'text-[13px] text-ink transition-colors',
                'hover:bg-cream-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream',
                isSelected && 'bg-cream-soft font-medium'
              )}
            >
              <span className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-sm bg-hairline-soft">
                <Icon className="h-3.5 w-3.5 stroke-ink" strokeWidth={2} />
              </span>
              {cat.label}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
